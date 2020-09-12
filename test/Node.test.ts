import * as assert from 'assert';
import 'mocha';

import {Node} from '../lib/Node';

describe('Node', () => {
	it('should create and traverse trees', () => {
		const root = new Node(() => null);

		assert.strictEqual(root.children.length, 0);

		let childNode = root.findOrCreateNode('/aa');
		assert.ok(childNode !== null);
		assert.ok(root.find('/aa') !== null);
		assert.ok(childNode.isLeaf());

		childNode = root.findOrCreateNode('/ab');
		assert.ok(childNode !== null);
		assert.ok(root.find('/aa') !== null);
		assert.ok(root.find('/ab') !== null);
		assert.ok(childNode.isLeaf());
		assert.strictEqual(childNode.segment, 'b');

		childNode = root.findOrCreateNode('/c');
		assert.ok(childNode !== null);
		assert.ok(root.find('/aa') !== null);
		assert.ok(root.find('/ab') !== null);
		assert.ok(root.find('/c') !== null);
	});

	it('should work when adding longer paths', () => {
		const root = new Node(() => null);

		let childNode = root.findOrCreateNode('/');
		assert.ok(childNode !== null);
		assert.ok(root.find('/') !== null);

		childNode = root.findOrCreateNode('/a');
		assert.ok(childNode !== null);
		assert.ok(root.find('/') !== null);
		assert.ok(root.find('/a') !== null);
	});

	it('should work when adding shorter paths', () => {
		const root = new Node(() => null);

		let childNode = root.findOrCreateNode('/a');
		assert.ok(childNode !== null);
		assert.ok(root.find('/a') !== null);

		childNode = root.findOrCreateNode('/');
		assert.ok(childNode !== null);
		assert.ok(root.find('/') !== null);
		assert.ok(root.find('/a') !== null);
	});

	it('should create the data object for all child Nodes', () => {
		const root = new Node(() => 1);

		function checkData(node: Node<number>) {
			[...node].forEach((child) => assert.strictEqual(child.data, 1));
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

	it('should have no Nodes with an empty segment', () => {
		const root = new Node(() => null);

		function checkData(node: Node<any>) {
			[...node].forEach((child) => assert.notStrictEqual(child.segment, ''));
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
	// TODO: findAll
	// TODO: find

	it('find(\'\') should return the root Node', () => {
		const node = new Node(() => null);

		const foundNode = node.find('');
		assert.ok(node === foundNode);
	});

	it('isLeaf()', () => {
		const node = new Node(() => null);

		assert.ok(node.isLeaf());
		const childNode = node.findOrCreateNode('/a');
		assert.ok(!node.isLeaf());
		assert.ok(childNode.isLeaf());
	});

	it('commonLength()', () => {
		assert.strictEqual(Node.commonLength('', ''), 0);
		assert.strictEqual(Node.commonLength('aa', 'aa'), 2);
		assert.strictEqual(Node.commonLength('aaa', 'aa'), 2);
		assert.strictEqual(Node.commonLength('aa', 'aaa'), 2);
		assert.strictEqual(Node.commonLength('ba', 'aaa'), 0);
		assert.strictEqual(Node.commonLength('baa', 'aa'), 0);
		assert.strictEqual(Node.commonLength('baa', 'bba'), 1);
		assert.strictEqual(Node.commonLength('bba', 'bba'), 3);
	});
});
