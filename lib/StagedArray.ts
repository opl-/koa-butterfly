/**
 * List that allows assigning a numerical value called "stage" to every element and accessing them according to the numerical order of the stages (or, if the stages match for multiple values, according to insertion order).
 */
export class StagedArray<D> {
	/** Contains tuples used for sorting the data. */
	private stagedData: [stage: number, data: D][] = [];
	/** Contains the ordered data based on `stagedData`. */
	private orderedStagedData: D[] = [];

	/** Returns a fresh copy of the ordered data array. */
	get orderedData() {
		return this.orderedStagedData.slice();
	}

	/** Current length of the array. */
	get length() {
		return this.stagedData.length;
	}

	/**
	 * Insert new data into this array at the appropriate index.
	 *
	 * @param stage Stage to use for the given data
	 * @param data Data to insert into this array. The order will be preserved.
	 */
	addData(stage: number, ...data: D[]): void {
		let insertIndex = (
			this.stagedData.length === 0 ? 0
			: this.stagedData[this.stagedData.length - 1][0] <= stage ? this.stagedData.length
			: this.stagedData.findIndex(([s]) => stage < s)
		);

		this.stagedData.splice(insertIndex, 0, ...data.map((d) => [stage, d] as [number, D]));
		this.orderedStagedData.splice(insertIndex, 0 , ...data);
	}

	/**
	 * Returns an array containing ordered data from this and the provided SortedArray instances.
	 *
	 * Ordering is done first by stage, then by order of arguments (with this instance being first).
	 *
	 * @param stagedArrays Other sorted array instances to take data from
	 */
	sortWith(stagedArrays: StagedArray<D>[]): D[] {
		if (stagedArrays.length === 0) return this.orderedData;

		const orderedTuples = this.stagedData
			.concat(...stagedArrays.map((stagedArray) => stagedArray.stagedData))
			.sort(([a], [b]) => a - b);

		return orderedTuples.map(([, data]) => data);
	}

	/** See `StagedArray.sortWith`. */
	static sort<D>(stagedArrays: StagedArray<D>[]): D[] {
		if (stagedArrays.length === 0) return [];

		return stagedArrays[0].sortWith(stagedArrays.slice(1));
	}
}
