import test from 'ava';

import {parsePath} from '../lib/pathParser';

test('should parse paths', (t) => {
	t.deepEqual(parsePath('/api'), [{
		type: 'path',
		path: '/api',
	}]);

	t.deepEqual(parsePath('/:param'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: null,
			stage: 0,
		},
	}]);
});

test('should disallow parameters at the beginning and immediately following other parameters', (t) => {
	t.throws(() => parsePath(':param'), {message: 'Path must not start with a parameter'});
	t.throws(() => parsePath('/:param1:param2'), {message: 'Parameter at index 8 must not immediately follow parameter "param1"'});
});

test('should disallow match all parameters if more path appears after them, unless they have a regex', (t) => {
	t.throws(() => parsePath('/:param*path'), {message: 'Match all parameter "param" without regex must not have any path remaining after it'});
	t.throws(() => parsePath('/:param*:another'), {message: 'Match all parameter "param" without regex must not have any path remaining after it'});
	t.throws(() => parsePath('/:param*/'), {message: 'Match all parameter "param" without regex must not have any path remaining after it'});

	t.deepEqual(parsePath('/:param([\\w/]{1,5})*/asd'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: true,
			regex: /^[\w/]{1,5}/,
			stage: 0,
		},
	}, {
		type: 'path',
		path: '/asd',
	}]);
});

test('should obtain parameter regexes', (t) => {
	t.deepEqual(parsePath('/:param(\\w+)'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: /^\w+/,
			stage: 0,
		},
	}]);

	t.deepEqual(parsePath('/:param((?:id)?\\d+)'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: /^(?:id)?\d+/,
			stage: 0,
		},
	}]);

	t.deepEqual(parsePath('/:param*'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: true,
			regex: null,
			stage: 0,
		},
	}]);

	t.deepEqual(parsePath('/:param(\\w+)*'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: true,
			regex: /^\w+/,
			stage: 0,
		},
	}]);
});

test('should handle parentheses in parameter regexes', (t) => {
	t.deepEqual(parsePath('/:param((:\\()+)'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: /^(:\()+/,
			stage: 0,
		},
	}]);

	t.deepEqual(parsePath('/:param((ab)+)'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: /^(ab)+/,
			stage: 0,
		},
	}]);
});

test('should handle parameter types and stages', (t) => {
	t.deepEqual(parsePath('/:param$10/asd'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: null,
			stage: 10,
		},
	}, {
		type: 'path',
		path: '/asd',
	}, ]);

	t.deepEqual(parsePath('/:param$-10'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: null,
			stage: -10,
		},
	}]);

	t.deepEqual(parsePath('/:param$1(\\d+)'), [{
		type: 'path',
		path: '/',
	}, {
		type: 'parameter',
		info: {
			name: 'param',
			matchAll: false,
			regex: /^\d+/,
			stage: 1,
		},
	}]);
});

test('should allow escapes', (t) => {
	t.deepEqual(parsePath('/\\:param'), [{
		type: 'path',
		path: '/:param',
	}]);
});
