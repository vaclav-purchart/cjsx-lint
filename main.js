'use strict';
const fs = require('fs')
const coffee = require('coffee-script')
const jetpack = require('fs-jetpack')
const path = require('path')

const FgGreen = "\x1b[32m";
const Reset = "\x1b[0m";
const FgRed = "\x1b[31m";

let script = process.argv[2];
let verbose = process.argv.indexOf('--verbose') >= 0;
let pwd;

const exec = require('child_process').execSync;


function log() {
	verbose && console.log.apply(console, arguments);
}

// -- working dir
if (process.argv.indexOf('--dir') >= 0) {
	pwd = process.argv[process.argv.indexOf('--dir') + 1];
	if (!pwd || jetpack.exists(pwd) === false) {
		console.log('Wrong working directory!');
		process.exit(1);
	}
	log(`Using working directory: "${pwd}"`);
}

if (script === '--diff') {

	console.log('================');
	let gitRoot = path.dirname(pwd);
	gitRoot = `${pwd}/.git`;
	while (jetpack.exists(gitRoot) === false && gitRoot !== '/.git') {
		gitRoot = path.normalize(path.dirname(gitRoot) + '/..') + '/.git';
	}
	gitRoot = path.dirname(gitRoot);
	log(`Detected GIT root: "${gitRoot}"`);

	let cmd = `cd "${gitRoot}" && git diff --name-only`
	let files = exec(cmd).toString().trim().split('\n');

	pwd = gitRoot;

	if (files.length > 0 && files[0] !== '') {
		console.log('Changed files: \n', files);
		for (let file of files) {
			checkFile(file);
		}
	}
	else {
		console.log(`No local changes at: "${gitRoot}"`);
	}
}
else {
	checkFile(script);
}

function checkFile(script) {
	// -- input script
	if (!script) {
		console.log('You have to specify file to be linted!');
		process.exit(1);
	}

	if (pwd && path.isAbsolute(script) === false) {
		script = path.join(pwd, script);
		// log(`Input file: ${script}`);
	}

	if (jetpack.exists(script) === false) {
		console.log(`Input file not found! "${script}"`);
		process.exit(1);
	}

	console.log(`--------- ${script} ---------`);
	log(`Checking ${script} ...`);

	// -- coffeelint
	let lintCfg = path.dirname(script);
	lintCfg = `${lintCfg}/coffeelint.json`;
	while (jetpack.exists(lintCfg) === false && lintCfg !== '//coffeelint.json') {
		lintCfg = path.normalize(path.dirname(lintCfg) + '/..') + '/coffeelint.json';
	}
	if (jetpack.exists(lintCfg)) {
		log(`Running coffeelint  cfg:${lintCfg}...`);

		let lintCmd = `${__dirname}/node_modules/.bin/coffeelint -f ${lintCfg} ${script}`;
		let lintOutCoffee = exec(lintCmd);

		if (lintOutCoffee.indexOf('Ok!') >= 0) {
			console.log(FgGreen + 'No Coffee errors :-)' + Reset + '  ');
		}
		else {
			console.log(FgRed + 'Coffee lint errors:' + Reset);
			console.log(lintOutCoffee);
		}
	}
	else {
		console.log('Skipping coffeelint - no coffelint.json found.');
	}

	// -- compile coffee
	let outDir = __dirname + '/out';
	jetpack.dir(outDir)
	let outJsx = outDir + '/out.jsx';
	let cmd = `${__dirname}/node_modules/.bin/coffee --print --compile ${script} > ${outJsx}`;

	log('Compling coffee script');
	exec(cmd);

	// -- compile JSX
	const babel = require('babel-core');

	log('Compling JSX ...');
	let jsxCode = jetpack.read(outJsx);
	let jsResult = require("babel-core").transform(jsxCode, {
		plugins: ["transform-react-jsx"]
	});
	let jsCode = jsResult.code;

	let outJs = outDir + '/out.js';
	jetpack.write(outJs, jsCode);

	// -- run EsLint
	log('Running esLint ...');
	var CLIEngine = require("eslint").CLIEngine;
	const config = { "extends": "eslint:recommended" };

	const cliEngine = new CLIEngine({
		baseConfig: config,
		envs: ['browser', 'node'],
		useEslintrc: false   // Assuming that you don't want any .eslintrc in the filesystem to interfere. If you want .eslintrc, omit this
	});

	const report = cliEngine.executeOnText(jsCode);
	var errorReport = CLIEngine.getErrorResults(report.results);

	// -- error reporting
	if (errorReport.length === 0) {
		console.log(FgGreen + 'No JS errors :-)' + Reset + '  ');
	}
	else {
		console.log(FgRed + 'Errors:' + Reset);
		errorReport[0].messages.forEach((msg) => {
			console.log(msg.message);
		});
	}

	// -- check requires
	let myRegexp = /require\(['"]([\w\/\-]+)['"]\)/gi;
	let match = myRegexp.exec(jsCode);
	let modules = {};
	while (match != null) {
		let requireStr = match[1];
		if (modules[requireStr]) {
			modules[requireStr]++;
		}
		else {
			modules[requireStr] = 1;
		}
		match = myRegexp.exec(jsCode);
	}

	for (let moduleName in modules) {
		if (modules[moduleName] > 1) {
			console.log(FgRed + `Multiple require error: "${moduleName}" required ${modules[moduleName]}-times` + Reset);
		}
	}
}
