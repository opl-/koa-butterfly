import test from 'ava';

import {StagedArray} from '../lib/StagedArray';

test('orders values according to stages', (t) => {
	const stagedArray = new StagedArray<string>();

	stagedArray.addData(0, 'a', 'A');
	t.deepEqual([...stagedArray.orderedData], ['a', 'A']);
	stagedArray.addData(10, 'b', 'B');
	t.deepEqual([...stagedArray.orderedData], ['a', 'A', 'b', 'B']);
	stagedArray.addData(5, 'c', 'C');
	t.deepEqual([...stagedArray.orderedData], ['a', 'A', 'c', 'C', 'b', 'B']);
	stagedArray.addData(-5, 'd', 'D');
	t.deepEqual([...stagedArray.orderedData], ['d', 'D', 'a', 'A', 'c', 'C', 'b', 'B']);

	// Existing stage should add data after the last one
	stagedArray.addData(5, 'e', 'E');
	t.deepEqual([...stagedArray.orderedData], ['d', 'D', 'a', 'A', 'c', 'C', 'e', 'E', 'b', 'B']);
});

test('sorts data with other StagedArrays', (t) => {
	const firstStagedArray = new StagedArray<string>();
	firstStagedArray.addData(0, 'a');
	firstStagedArray.addData(5, 'b');
	firstStagedArray.addData(-5, 'c');

	const secondStagedArray = new StagedArray<string>();
	secondStagedArray.addData(0, 'A');
	secondStagedArray.addData(10, 'B');
	secondStagedArray.addData(-15, 'C');

	t.deepEqual(firstStagedArray.sortWith([secondStagedArray]), ['C', 'c', 'a', 'A', 'b', 'B']);
	t.deepEqual(StagedArray.sort([firstStagedArray, secondStagedArray]), ['C', 'c', 'a', 'A', 'b', 'B']);

	// Argument order is significant
	t.deepEqual(secondStagedArray.sortWith([firstStagedArray]), ['C', 'c', 'A', 'a', 'b', 'B']);
	t.deepEqual(StagedArray.sort([secondStagedArray, firstStagedArray]), ['C', 'c', 'A', 'a', 'b', 'B']);

	// Works with empty arrays
	t.deepEqual(StagedArray.sort([new StagedArray()]), []);
	t.deepEqual(new StagedArray().sortWith([]), []);

	// Works when no other arrays are provided
	t.deepEqual(StagedArray.sort([]), []);
	t.deepEqual(firstStagedArray.sortWith([]), ['c', 'a', 'b']);
});

test('.length', (t) => {
	const stagedArray = new StagedArray<string>();
	
	t.is(stagedArray.length, 0);
	stagedArray.addData(0, 'a', 'A');
	t.is(stagedArray.length, 2);
	stagedArray.addData(0, 'b');
	t.is(stagedArray.length, 3);
});
