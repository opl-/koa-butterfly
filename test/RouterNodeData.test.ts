import test from 'ava';

import {RouterNodeData, SpecialMethod} from '../lib/Router';

const middleware1 = () => {};
const middleware2 = () => {};
const middleware3 = () => {};

test('should allow adding and retrieving middleware for different methods without conflicting', (t) => {
	const nodeData = new RouterNodeData();

	nodeData.addMiddleware('GET', 0, middleware1, middleware2);
	t.true(nodeData.middleware.has('GET'));
	t.deepEqual([...nodeData.middleware.get('GET')!], [[0, [middleware1, middleware2]]]);
	t.deepEqual(nodeData.getMiddlewareStage('GET', 0), [middleware1, middleware2]);

	nodeData.addMiddleware(SpecialMethod.ALL, 0, middleware2, middleware3);
	t.true(nodeData.middleware.has(SpecialMethod.ALL));
	t.deepEqual([...nodeData.middleware.get(SpecialMethod.ALL)!], [[0, [middleware2, middleware3]]]);
	t.deepEqual(nodeData.getMiddlewareStage(SpecialMethod.ALL, 0), [middleware2, middleware3]);
});

test('should order middleware according to stages', (t) => {
	const nodeData = new RouterNodeData();

	nodeData.addMiddleware('GET', 0, middleware1);
	nodeData.addMiddleware('GET', 5, middleware2);
	nodeData.addMiddleware('GET', -5, middleware3);
	t.deepEqual([...nodeData.orderedMiddleware.get('GET')!], [middleware3, middleware1, middleware2]);
});

test('should order middleware and exact middleware together', (t) => {
	const nodeData = new RouterNodeData();

	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, 0, middleware1);
	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE, 5, middleware2);
	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE, 0, middleware3);
	t.deepEqual(nodeData.orderedMiddlewareForExact, [middleware3, middleware1, middleware2]);
});

test('orderMiddlewareForExact()', (t) => {
	let nodeData = new RouterNodeData();

	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, 5, middleware1);
	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE_EXACT, 0, middleware2);
	t.deepEqual(nodeData.orderedMiddlewareForExact, [middleware2, middleware1]);

	nodeData = new RouterNodeData();

	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE, 5, middleware1);
	nodeData.addMiddleware(SpecialMethod.MIDDLEWARE, 0, middleware2);
	t.deepEqual(nodeData.orderedMiddlewareForExact, [middleware2, middleware1]);

	nodeData = new RouterNodeData();

	t.deepEqual(nodeData.orderedMiddlewareForExact, []);
	nodeData.orderMiddlewareForExact();
	t.deepEqual(nodeData.orderedMiddlewareForExact, []);
});
