import * as assert from "assert";
import * as path from "path";
import * as vs from "vscode";
import { Sdks } from "../../src/utils";
import { ext } from "../helpers";

const isWin = /^win/.test(process.platform);

describe("Test environment", () => {
	it("has opened the correct folder", () => {
		const wfs = vs.workspace.workspaceFolders;
		assert.equal(wfs.length, 1);
		assert.ok(
			wfs[0].uri.fsPath.endsWith(path.sep + "flutter"),
			`${wfs[0].uri.fsPath} doesn't end with ${path.sep}flutter`,
		);
	});
});

describe("Extension", () => {
	it("activated", async () => {
		await ext.activate();
		assert.equal(ext.isActive, true);
	});
	it("Reported no errors", async () => {
		await ext.activate();
		await ext.exports.analysisComplete;
		assert.ok(false); // Need to test there are 0 errors
	}).timeout(1000 * 60 * 5); // 5 minutes
});
