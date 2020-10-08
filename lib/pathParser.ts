export interface ParameterInfo {
	name: string;
	regex: RegExp | null;
	matchAll: boolean;
	stage: number;
}

export type ParsedPathSegment = {
	type: 'path';
	path: string;
} | {
	type: 'parameter';
	info: ParameterInfo;
}

interface ParserState {
	input: string;
	index: number;
	output: ParsedPathSegment[];
}

function expect(s: ParserState, str: string): boolean {
	if (s.input.substr(s.index).startsWith(str)) {
		s.index += str.length;
		return true;
	}

	return false;
}

function expectHard(s: ParserState, str: string): boolean {
	if (expect(s, str)) return true;

	throw new Error(`Expected ${JSON.stringify(str)}, got ${JSON.stringify(s.input.substr(s.index, s.index + str.length))}`);
}

function consume(s: ParserState, regex: RegExp): string | false {
	const result = regex.exec(s.input.substr(s.index));

	if (result === null) return false;

	s.index += result[0].length;

	return result[0];
}

function consumeHard(s: ParserState, regex: RegExp): string {
	const result = consume(s, regex);

	if (result === false) throw new Error(`Expected /${regex.source}/, got ${JSON.stringify(s.input.substr(s.index, s.index + 5))}`);

	return result;
}

function parseParam(s: ParserState): ParameterInfo {
	expectHard(s, ':');
	const name = consumeHard(s, /^\w+/);
	let regex: string = '';
	let stage = 0;

	if (expect(s, '$')) {
		const stageStr = consume(s, /^-?\d+/);

		if (stageStr !== false) stage = parseInt(stageStr, 10);
	}

	if (expect(s, '(')) {
		let depth = 1;
		let escape = false;

		for (; s.index < s.input.length && depth > 0; s.index++) {
			const c = s.input[s.index];

			if (escape) escape = false;
			else if (c === '\\') escape = true;
			else if (c === '(') depth++;
			else if (c === ')') depth--;

			regex += c;
		}

		if (depth > 0) throw new Error(`Unterminated regex sequence at index ${s.index} (param ${JSON.stringify(name)})`);
		if (regex.length <= 1) throw new Error(`Missing parameter regex at index ${s.index} (param ${JSON.stringify(name)})`);

		regex = regex.substr(0, regex.length - 1);
	}

	const matchAll = expect(s, '*');

	return {
		name,
		matchAll,
		regex: regex.length === 0 ? null : new RegExp(`^${regex}`),
		stage,
	};
}

function parseLiteral(s: ParserState): string {
	let buff = '';

	while (true) {
		const c = s.input[s.index];

		if (c === '\\') {
			s.index++;
			buff += s.input[s.index];
			s.index++;
		} else {
			const consumed = consume(s, /^[^:\\]+/);
			if (consumed === false) break;
			buff += consumed;
		}
	}

	if (buff.length === 0) throw new Error(`Unexpected ${JSON.stringify(s.input[s.index])} while trying to parse literal`);

	return buff;
}

function parsePrimary(s: ParserState) {
	const c = s.input[s.index];

	if (c === ':') {
		if (s.output.length === 0) throw new Error('Path must not start with a parameter');
		const lastOutput = s.output[s.output.length - 1];
		if (lastOutput.type === 'parameter' && lastOutput.info.regex === null) throw new Error(`Parameter at index ${s.index} must not immediately follow parameter without regex ${JSON.stringify(lastOutput.info.name)}`);

		const parameter = parseParam(s);

		if (s.index !== s.input.length && parameter.matchAll && parameter.regex === null) throw new Error(`Match all parameter ${JSON.stringify(parameter.name)} without regex must not have any path remaining after it`);

		s.output.push({
			type: 'parameter',
			info: parameter,
		});
	} else {
		const literal = parseLiteral(s);
		s.output.push({
			type: 'path',
			path: literal,
		});
	}
}

export function parsePath(path: string): ParsedPathSegment[] {
	const s: ParserState = {
		input: path,
		index: 0,
		output: [],
	};

	while (s.index < path.length) {
		let lastIndex = s.index;
		parsePrimary(s);
		/* istanbul ignore if: safety check */
		if (lastIndex === s.index) throw new Error(`Parsing stuck at index ${s.index}`);
	}

	return s.output;
}
