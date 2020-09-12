import {Context, Middleware, Next} from 'koa';
import compose from 'koa-compose';

import {Node} from './Node';

export class RouterNodeData {
	middleware: Map<number, Middleware[]> = new Map();
	orderedMiddleware: Middleware[] = [];

	endpoints: Map<string, Middleware[]> = new Map();

	getMiddlewareStage(stage: number): Middleware[] {
		const array = this.middleware.get(stage);
		if (array) return array;

		const newArray: Middleware[] = [];
		this.middleware.set(stage, newArray);
		return newArray;
	}

	addMiddleware(stage: number, ...middleware: Middleware[]): void {
		const stageArray = this.getMiddlewareStage(stage);

		stageArray.push(...middleware);

		this.orderMiddlewares();
	}

	orderMiddlewares(): void {
		this.orderedMiddleware = [...this.middleware.keys()].sort().reduce((acc, key) => {
			acc.push(...this.getMiddlewareStage(key));
			return acc;
		}, [] as Middleware[]);
	}

	// FIXME: use positive stages for endpoints and negative for middleware instead of having them split up?
	getEndpointMethod(method: string): Middleware[] {
		const normalizedMethod = method.toUpperCase();

		const array = this.endpoints.get(normalizedMethod);
		if (array) return array;

		const newArray: Middleware[] = [];
		this.endpoints.set(normalizedMethod, newArray);
		return newArray;
	}

	addEndpoint(method: string, ...middleware: Middleware[]): void {
		const methodArray = this.getEndpointMethod(method);

		methodArray.push(...middleware);
	}

	toString(): string {
		return `${this.middleware.size} stages, ${this.orderedMiddleware.length} ordered middlewares, ${this.endpoints.size} methods`;
	}
}

export interface RouterOptions {
	strictSlashes?: boolean;
}

/**
 * A router implementation for Koa using a radix tree.
 */
export class Router {
	rootNode: Node<RouterNodeData> = new Node(() => new RouterNodeData());

	private strictSlashes: boolean;

	constructor(opts: RouterOptions = {}) {
		this.strictSlashes = opts.strictSlashes ?? false;
	}

	normalizePath(path: string): string {
		if (this.strictSlashes) return path;
		if (path === '/') return path;
		if (path.endsWith('/')) return path.substr(0, path.length - 1);
		return path;
	}

	addMiddleware(path: string, stage: number, ...middleware: Middleware[]): void {
		if (path.length < 0 || path[0] !== '/') throw new Error('Paths must start with "/"');

		path = this.normalizePath(path);

		const node = this.rootNode.findOrCreateNode(path);

		node.data.addMiddleware(stage, ...middleware);
	}

	addEndpoint(path: string, method: string, ...middleware: Middleware[]): void {
		if (path.length < 0 || path[0] !== '/') throw new Error('Paths must start with "/"');

		path = this.normalizePath(path);

		const node = this.rootNode.findOrCreateNode(path);

		node.data.addEndpoint(method, ...middleware);
	}

	middleware(): Middleware {
		return this.middlewareHandler.bind(this);
	}

	async middlewareHandler(ctx: Context, next: Next): Promise<void> {
		const path = this.normalizePath(ctx.path);

		const nodes = this.rootNode.findAll(path);
		if (!nodes) return next();

		console.log(ctx.method, ctx.path);

		const matchingMiddleware = nodes
			.filter((node, index, arr) => {
				// Always leave in the root and last Node
				if (index === 0 || index === arr.length - 1) return true;
				// Allow any Nodes that end with a slash or are the last part of a path segment
				if (node.segment.endsWith('/') || arr[index + 1].segment.startsWith('/')) return true;
				// Don't allow any other nodes
				return false;
			})
			.map((node) => node.data.orderedMiddleware)
			.reduce((acc, arr) => acc.concat(arr))
			.concat(nodes[nodes.length - 1].data.getEndpointMethod(ctx.method));

		return compose(matchingMiddleware)(ctx, next);
	}
}
