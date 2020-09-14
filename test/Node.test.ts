import test from 'ava';

import {Node} from '../lib/Node';

test('should create and traverse trees', (t) => {
	const root = new Node(() => null);

	t.is(root.children.length, 0);

	let childNode = root.findOrCreateNode('/aa');
	t.not(childNode, null);
	t.not(root.find('/aa'), null);
	t.true(childNode.isLeaf());

	childNode = root.findOrCreateNode('/ab');
	t.not(childNode, null);
	t.not(root.find('/aa'), null);
	t.not(root.find('/ab'), null);
	t.true(childNode.isLeaf());
	t.is(childNode.segment, 'b');

	childNode = root.findOrCreateNode('/c');
	t.not(childNode, null);
	t.not(root.find('/aa'), null);
	t.not(root.find('/ab'), null);
	t.not(root.find('/c'), null);
});

test('should work when adding longer paths', (t) => {
	const root = new Node(() => null);

	let childNode = root.findOrCreateNode('/');
	t.not(childNode, null);
	t.not(root.find('/'), null);

	childNode = root.findOrCreateNode('/a');
	t.not(childNode, null);
	t.not(root.find('/'), null);
	t.not(root.find('/a'), null);
});

test('should work when adding shorter paths', (t) => {
	const root = new Node(() => null);

	let childNode = root.findOrCreateNode('/a');
	t.not(childNode, null);
	t.not(root.find('/a'), null);

	childNode = root.findOrCreateNode('/');
	t.not(childNode, null);
	t.not(root.find('/'), null);
	t.not(root.find('/a'), null);
});

test('should create the data object for all child Nodes', (t) => {
	const root = new Node(() => 1);

	function checkData(node: Node<number>) {
		[...node].forEach((child) => t.is(child.data, 1));
	}

	root.findOrCreateNode('/');
	checkData(root);

	root.findOrCreateNode('/a');
	checkData(root);

	root.findOrCreateNode('/b');
	checkData(root);

	root.findOrCreateNode('/ab');
	checkData(root);
});

test('should have no Nodes with an empty segment', (t) => {
	const root = new Node(() => null);

	function checkData(node: Node<any>) {
		[...node].forEach((child) => t.not(child.segment, ''));
	}

	root.findOrCreateNode('/');
	checkData(root);

	root.findOrCreateNode('/a');
	checkData(root);

	root.findOrCreateNode('/b');
	checkData(root);

	root.findOrCreateNode('/ab');
	checkData(root);
});

test('should allow root nodes to use custom names', (t) => {
	const root = new Node(() => null, 'The Root');

	const child = root.findOrCreateNode('/');

	t.is(root.find(''), root);
	t.is(root.find('/'), child);
	t.is(root.segment, 'The Root');

	const defaultRoot = new Node(() => null);
	t.is(defaultRoot.segment, '<root>');
});

test('find() should return the correct nodes', (t) => {
	const root = new Node(() => null);

	const slash = root.findOrCreateNode('/');
	const a = root.findOrCreateNode('/a');
	const b = root.findOrCreateNode('/b');

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

	const slash = root.findOrCreateNode('/');
	const a = root.findOrCreateNode('/a');
	const b = root.findOrCreateNode('/b');

	t.deepEqual(root.findAll(''), [root]);
	t.deepEqual(root.findAll('/'), [root, slash]);
	t.deepEqual(root.findAll('/a'), [root, slash, a]);
	t.deepEqual(root.findAll('/b'), [root, slash, b]);
	t.is(root.findAll('/c'), null);
});

test('isLeaf()', (t) => {
	const node = new Node(() => null);

	t.true(node.isLeaf());
	const childNode = node.findOrCreateNode('/a');
	t.false(node.isLeaf());
	t.true(childNode.isLeaf());
});

test('stringify()', (t) => {
	const node = new Node(() => ({
		toString() {
			return 'node data';
		}
	}));
	node.findOrCreateNode('/test');

	t.is(node.stringify(), '<root>: node data\n  /test: node data');
});

test('*[Symbol.iterator]()', (t) => {
	const root = new Node(() => null);

	t.deepEqual([...root], [root]);
	const slash = root.findOrCreateNode('/');
	t.deepEqual([...root], [root, slash]);
	const a = root.findOrCreateNode('/a');
	t.deepEqual([...root], [root, slash, a]);
	const b = root.findOrCreateNode('/b');
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
