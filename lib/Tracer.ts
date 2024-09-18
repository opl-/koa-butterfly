const indentCache = [''];

function getIndent(depth: number): string {
	for (let index = indentCache.length; index <= depth; index++) {
		indentCache[index] = indentCache[index - 1] + ' ';
	}

	return indentCache[depth];
}

export class Tracer {
	private depth: number = 0;

	constructor(
		private output: (message: string) => void = console.log.bind(console),
	) {
	}

	addIndent(indent: number): void {
		this.depth += indent;

		if (this.depth < 0) throw new Error('Tracer depth went negative.');
	}

	log(message: string): void {
		this.output(getIndent(this.depth) + message);
	}

	logPath(consumedPath: string, extra?: string, faint: boolean = false): void {
		this.log(`\x1b[${faint ? '2' : '1'}m${consumedPath}\x1b[22m${extra ? ` ${extra}` : ''}`);
	}

	logEvent(event: string): void {
		this.log(`+ ${event}`);
	}
}
