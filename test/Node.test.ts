import test from 'ava';

import {Node} from '../lib/Node';

test('should create and traverse trees', (t) => {
	const root = new Node(() => null);

	t.is(root.children.length, 0);

	const aa = root.find('/aa', true);
	t.not(aa, null);
	t.is(root.find('/aa'), aa);
	t.true(aa.isLeaf());
	t.is(aa.segment, '/aa');

	const ab = root.find('/ab', true);
	t.not(ab, null);
	t.is(root.find('/aa'), aa);
	t.is(root.find('/ab'), ab);
	t.true(aa.isLeaf());
	t.true(ab.isLeaf());
	t.not(root.find('/a'), null);
	t.is(root.find('/a')?.segment, '/a');
	t.is(aa.segment, 'a');
	t.is(ab.segment, 'b');

	const c = root.find('/c', true);
	t.not(c, null);
	t.is(root.find('/aa'), aa);
	t.is(root.find('/ab'), ab);
	t.is(root.find('/c'), c);
});

test('should work when adding longer paths', (t) => {
	const root = new Node(() => null);

	const slash = root.find('/', true);
	t.not(slash, null);
	t.is(root.find('/'), slash);

	const a = root.find('/a', true);
	t.not(a, null);
	t.is(root.find('/'), slash);
	t.is(root.find('/a'), a);
});

test('should work when adding shorter paths', (t) => {
	const root = new Node(() => null);

	const a = root.find('/a', true);
	t.not(a, null);
	t.is(root.find('/a'), a);

	const slash = root.find('/', true);
	t.not(slash, null);
	t.is(root.find('/'), slash);
	t.is(root.find('/a'), a);
});

test('should work when branching with more segments left', (t) => {
	const root = new Node(() => null);

	const ab = root.find('/ab', true);
	const slash = root.find('/', true);
	const ac = root.find('/ac', true);

	t.is(root.find('/ab'), ab);
	t.is(root.find('/'), slash);
	t.is(root.find('/ac'), ac);
});

test('should create the data object for all child Nodes', (t) => {
	const root = new Node(() => 1);

	function checkData(node: Node<number>) {
		[...node].forEach((child) => t.is(child.data, 1));
	}

	root.find('/', true);
	checkData(root);

	root.find('/a', true);
	checkData(root);

	root.find('/b', true);
	checkData(root);

	root.find('/ab', true);
	checkData(root);
});

test('should have no Nodes with an empty segment', (t) => {
	const root = new Node(() => null);

	function checkData(node: Node<any>) {
		[...node].forEach((child) => t.not(child.segment, ''));
	}

	root.find('/', true);
	checkData(root);

	root.find('/a', true);
	checkData(root);

	root.find('/b', true);
	checkData(root);

	root.find('/ab', true);
	checkData(root);
});

test('should allow root nodes to use custom names', (t) => {
	const root = new Node(() => null, 'The Root');

	const child = root.find('/', true);

	t.is(root.find(''), root);
	t.is(root.find('/'), child);
	t.is(root.segment, 'The Root');

	const defaultRoot = new Node(() => null);
	t.is(defaultRoot.segment, '<root>');
});

test('find() should return the correct nodes', (t) => {
	const root = new Node(() => null);

	const slash = root.find('/', true);
	const a = root.find('/a', true);
	const b = root.find('/b', true);

	t.is(root.find('/'), slash);
	t.is(root.find('/a'), a);
	t.is(root.find('/b'), b);
	t.is(root.find('/c'), null);
});

test('find(\'\') should return the root Node', (t) => {
	const node = new Node(() => null);

	const foundNode = node.find('');
	t.is(foundNode, node);
});

test('findAll() should return the correct nodes', (t) => {
	const root = new Node(() => null);

	const slash = root.find('/', true);
	const a = root.find('/a', true);
	const b = root.find('/b', true);

	t.deepEqual(root.findAll(''), [root]);
	t.deepEqual(root.findAll('/'), [root, slash]);
	t.deepEqual(root.findAll('/a'), [root, slash, a]);
	t.deepEqual(root.findAll('/b'), [root, slash, b]);
	t.is(root.findAll('/c'), null);
});

test('nodeIterator() should iterate over all nodes', (t) => {
	const root = new Node(() => null);

	const slash = root.find('/', true);
	const a = root.find('/a', true);
	const b = root.find('/b', true);

	t.deepEqual([...root.nodeIterator('')], [{node: root, remainingPath: ''}]);
	t.deepEqual([...root.nodeIterator('/')], [{node: root, remainingPath: '/'}, {node: slash, remainingPath: ''}]);
	t.deepEqual([...root.nodeIterator('/a')], [{node: root, remainingPath: '/a'}, {node: slash, remainingPath: 'a'}, {node: a, remainingPath: ''}]);
	t.deepEqual([...root.nodeIterator('/b')], [{node: root, remainingPath: '/b'}, {node: slash, remainingPath: 'b'}, {node: b, remainingPath: ''}]);
	t.deepEqual([...root.nodeIterator('/c')], [{node: root, remainingPath: '/c'}, {node: slash, remainingPath: 'c'}]);
});

test('nodeIterator() should allow changing remainingPath', (t) => {
	const root = new Node(() => null);

	function result(node: Node<any>, remainingPath: string) {
		return {
			done: false,
			value: {
				node,
				remainingPath,
			},
		} as const;
	}

	const doneResult = {
		done: true,
		value: undefined,
	} as const;

	const slash = root.find('/', true);
	const a = root.find('/a', true);
	const b = root.find('/b', true);

	// Change path right before it's matched to a valid node
	let generator = root.nodeIterator('/a');
	t.deepEqual(generator.next(), result(root, '/a'));
	t.deepEqual(generator.next(), result(slash, 'a'));
	t.deepEqual(generator.next('b'), result(b, ''));
	t.deepEqual(generator.next(), doneResult);

	// Change path after it wasn't going to match
	generator = root.nodeIterator('/xa');
	t.deepEqual(generator.next(), result(root, '/xa'));
	t.deepEqual(generator.next(), result(slash, 'xa'));
	t.deepEqual(generator.next('a'), result(a, ''));
	t.deepEqual(generator.next(), doneResult);

	// Change path to leave some remaining at the end
	generator = root.nodeIterator('/ac');
	t.deepEqual(generator.next(), result(root, '/ac'));
	t.deepEqual(generator.next('/ax'), result(slash, 'ax'));
	t.deepEqual(generator.next(), result(a, 'x'));
	t.deepEqual(generator.next(), doneResult);

	// Change path after we reached the end so it matches more nodes
	generator = root.nodeIterator('/');
	t.deepEqual(generator.next(), result(root, '/'));
	t.deepEqual(generator.next(), result(slash, ''));
	t.deepEqual(generator.next('a'), result(a, ''));
	t.deepEqual(generator.next(), doneResult);

	// Changing path on first call should do nothing as the first path is passed as an argument
	generator = root.nodeIterator('/a');
	t.deepEqual(generator.next('x'), result(root, '/a'));
	t.deepEqual(generator.next(), result(slash, 'a'));
	t.deepEqual(generator.next(), result(a, ''));
	t.deepEqual(generator.next(), doneResult);
});

test('isLeaf()', (t) => {
	const node = new Node(() => null);

	t.true(node.isLeaf());
	const childNode = node.find('/a', true);
	t.false(node.isLeaf());
	t.true(childNode.isLeaf());
});

test('stringify()', (t) => {
	let node: Node<any> = new Node(() => ({
		toString() {
			return 'node data';
		}
	}));
	node.find('/test', true);

	t.is(node.stringify(), '<root>: node data\n  /test: node data');

	node = new Node(() => ({
		toString: 'nope',
	}));
	node.find('/test', true);

	t.is(node.stringify(), '<root>\n  /test');
});

test('*[Symbol.iterator]()', (t) => {
	const root = new Node(() => null);

	t.deepEqual([...root], [root]);
	const slash = root.find('/', true);
	t.deepEqual([...root], [root, slash]);
	const a = root.find('/a', true);
	t.deepEqual([...root], [root, slash, a]);
	const b = root.find('/b', true);
	t.deepEqual([...root], [root, slash, a, b]);
});

test('commonLength()', (t) => {
	t.is(Node.commonLength('', ''), 0);
	t.is(Node.commonLength('aa', 'aa'), 2);
	t.is(Node.commonLength('aaa', 'aa'), 2);
	t.is(Node.commonLength('aa', 'aaa'), 2);
	t.is(Node.commonLength('ba', 'aaa'), 0);
	t.is(Node.commonLength('baa', 'aa'), 0);
	t.is(Node.commonLength('baa', 'bba'), 1);
	t.is(Node.commonLength('bba', 'bba'), 3);
});
