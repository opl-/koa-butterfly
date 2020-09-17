export interface IteratorResult<D> {
	node: Node<D>;
	remainingPath: string;
}

export class Node<D> {
	/** Path segment this Node represents. */
	segment: string;

	/** Children of this Node. */
	children: Node<D>[] = [];

	/** Function used to initialize the data object. */
	dataCreator: () => D;

	/** Data stored in this Node. */
	data: D;

	/**
	 * A radix tree implementation.
	 *
	 * @param dataCreator Function used to initialize the data variable of new Nodes
	 * @param segment Part of the path for this Node
	 */
	constructor(dataCreator: () => D, segment: string = '<root>') {
		this.segment = segment;
		this.dataCreator = dataCreator;

		this.data = dataCreator();
	}

	/**
	 * Returns `true` if this node has no children.
	 */
	isLeaf(): boolean {
		return this.children.length === 0;
	}

	/**
	 * Generator function yielding for every Node encountered.
	 *
	 * Similar to `findAll()` but allows stopping at any point (by not invoking the generator) and changing the path on the fly (to handle params).
	 *
	 * @param path Path of the node to find
	 */
	*nodeIterator(path: string): Generator<IteratorResult<D>, void, undefined | string> {
		let remainingPath = (yield {
			node: this,
			remainingPath: path,
		}) || path;

		// If path is empty, stop there
		if (remainingPath.length === 0) return;

		let node: Node<D> | null = this;

		while (node !== null && !node.isLeaf() && remainingPath.length > 0) {
			let found = false;

			for (let child of node.children) {
				if (remainingPath.startsWith(child.segment)) {
					node = child;
					remainingPath = remainingPath.substr(child.segment.length);

					const newPath = yield {
						node,
						remainingPath,
					};

					// If a new path is passed in, replace the remaining path with it.
					if (typeof newPath === 'string') remainingPath = newPath;

					// If no more path remains, end the generator
					if (remainingPath.length === 0) return;

					// We found our child, iterate over its children
					found = true;
					break;
				}
			}

			// If we didn't find any children, we reached the end of the chain and should stop
			if (!found) break;
		}
	}

	/**
	 * Traverses the tree to find all Nodes leading to the given path.
	 *
	 * If `createIfNone` is set and no Node exists at the exact given path, a new Node will be inserted there, even if it will lead to a Node with just one child. This is used to allow having data in the middle of a path.
	 *
	 * @param path Path of node to find
	 * @param createIfNone If `true`, a Node will be created for the given path if one isn't found
	 */
	findAll(path: string, createIfNone = false): Node<D>[] | null {
		let node: Node<D> | null = this;
		const output: Node<D>[] = [node];

		// If path is empty, return the root node
		if (path.length === 0) return output;

		let remainingPath = path;

		while (node !== null && !node.isLeaf() && remainingPath.length > 0) {
			let found = false;

			for (let child of node.children) {
				if (remainingPath.startsWith(child.segment)) {
					node = child;
					remainingPath = remainingPath.substr(child.segment.length);

					output.push(node);

					if (remainingPath.length === 0) return output;

					found = true;
					break;
				}
			}

			if (!found) break;
		}

		if (!createIfNone) return null;
		
		let bestCommonLength = 0;
		let bestNode = null;

		for (let child of node.children) {
			const commonLength = Node.commonLength(remainingPath, child.segment);

			if (commonLength > 0) {
				bestCommonLength = commonLength;
				bestNode = child;
				break;
			}
		}

		if (!bestNode) {
			// There are no nodes with a matching prefix. Create a new node and return it.
			const newNode = new Node(this.dataCreator, remainingPath);
			node.children.push(newNode);

			output.push(newNode);
			return output;
		}

		const commonSegment = bestNode.segment.substr(0, bestCommonLength);

		// Create a new node for the new branches
		const branchNode = new Node(this.dataCreator, commonSegment);
		output.push(branchNode);

		// Modify the children of the last found node
		node.children.splice(this.children.indexOf(bestNode), 1, branchNode);

		// Adjust the old node
		bestNode.segment = bestNode.segment.substr(bestCommonLength);
		branchNode.children.push(bestNode);

		// The newly created branch node is the last part of the path
		if (remainingPath.length <= commonSegment.length) return output;

		// There's still some path remaining. Create a node for the remaining part and return it.
		const newNode = new Node(this.dataCreator, remainingPath.substr(bestCommonLength));
		branchNode.children.push(newNode);

		output.push(newNode);
		return output;
	}

	/**
	 * Returns the Node at the exact given path or `null` if one doesn't exist.
	 *
	 * @param path Path of node to find
	 */
	find(path: string): Node<D> | null {
		const nodes = this.findAll(path);
		if (!nodes) return null;
		return nodes[nodes.length - 1];
	}

	/**
	 * Returns the Node at the exact given path, inserting a new Node if one doesn't already exist there.
	 *
	 * See `Node.findAll(path, true)`.
	 *
	 * @param path Path of node to find
	 */
	findOrCreateNode(path: string): Node<D> {
		const nodes = this.findAll(path, true);
		/* istanbul ignore next: sanity check that should never be true */
		if (!nodes) throw new Error(`findAll failed to find or create a new node (for ${JSON.stringify(path)})`);
		return nodes[nodes.length - 1];
	}

	/**
	 * Returns the tree as a string. Useful for debugging.'
	 *
	 * @param indent Level of indentation for the returned string. Defaults to 0.
	 */
	stringify(indent = 0): string {
		const output: string[] = [];

		const indendStr = new Array(indent).fill('  ').join('');

		output.push(`${indendStr}${this.segment}`);
		if (typeof (this.data as any)?.toString === 'function') output.push(`: ${(this.data as any).toString()}`);

		for (const node of this.children) {
			output.push(`\n${node.stringify(indent + 1)}`);
		}

		return output.join('');
	}

	*[Symbol.iterator](): Generator<Node<D>, void, unknown> {
		yield this;

		for (const node of this.children) {
			const iterator = node[Symbol.iterator]();

			let result = iterator.next();
			while (!result.done) {
				yield result.value;
				result = iterator.next();
			}
		}
	}

	/**
	 * Returns the amount of characters the beginnings of both strings share.
	 *
	 * @param a First string
	 * @param b Second string
	 */
	static commonLength(a: string, b: string): number {
		const maxChars = Math.min(a.length, b.length);

		for (let i = 0; i < maxChars; i++) {
			if (a[i] !== b[i]) return i;
		}

		return maxChars;
	}
}
