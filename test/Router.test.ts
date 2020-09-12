import * as assert from 'assert';
import 'mocha';

import {Router} from '../lib/Router';

describe('Router', () => {
	it('should create and traverse trees', () => {
		const router = new Router();

		router.addMiddleware('/', 0, async (ctx, next) => {
			ctx.body = 'root';
			return next();
		});

		router.addMiddleware('/api', 10, async (ctx, next) => {
			ctx.body += ':/api';
		});

		router.addMiddleware('/api/user', 10, async (ctx, next) => {
			ctx.body += ':/api/user';
		});

		router.addMiddleware('/api/user', 0, async (ctx, next) => {
			ctx.body += ':/api/user';
		});
	});
});
