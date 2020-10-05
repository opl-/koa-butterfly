import test from 'ava';

import {RouterNodeData, SpecialMethod} from '../lib/Router';

const middleware1 = () => {};
const middleware2 = () => {};
const middleware3 = () => {};

test('should allow adding and retrieving middleware for different methods without conflicting', (t) => {
	const nodeData = new RouterNodeData();

	nodeData.getMethodData('GET', true).middleware.addData(0, middleware1);
	nodeData.getMethodData('GET', true).terminators.addData(0, middleware2);
	nodeData.getMethodData(SpecialMethod.ALL, true).middleware.addData(0, middleware3);
	nodeData.getMethodData(SpecialMethod.ALL, true).terminators.addData(0, middleware1);

	t.deepEqual(nodeData.getMethodData('GET')?.middleware.orderedData, [middleware1]);
	t.deepEqual(nodeData.getMethodData('GET')?.terminators.orderedData, [middleware2]);
	t.deepEqual(nodeData.getMethodData(SpecialMethod.ALL)?.middleware.orderedData, [middleware3]);
	t.deepEqual(nodeData.getMethodData(SpecialMethod.ALL)?.terminators.orderedData, [middleware1]);
});

test('getMethodData()', (t) => {
	let nodeData = new RouterNodeData();

	const getMethodData = nodeData.getMethodData('GET', true);
	const postMethodData = nodeData.getMethodData('POST', true);

	// Returns a value
	t.truthy(getMethodData);
	t.truthy(postMethodData);

	// Returns the same value
	t.is(nodeData.getMethodData('GET'), getMethodData);
	t.is(nodeData.getMethodData('POST'), postMethodData);

	// Returns different values for different methods
	t.not(getMethodData, postMethodData);
});
