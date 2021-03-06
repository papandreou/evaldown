const fs = require("fs").promises;
const fsExtra = require("fs-extra");
const glob = require("fast-glob");
const path = require("path");

const debug = require("./debug").extend("Evaldown");
const errors = require("./errors");
const Markdown = require("./md/Markdown");
const Stats = require("./Stats");

const DEFAULT_SOURCE_EXTENSION = ".md";

const formats = {
  html: {
    defaultExtension: ".html",
    magicpenFormat: "html",
    generateOutput: async maker => (await maker.withInlinedExamples()).toHtml()
  },
  inlined: {
    defaultExtension: ".md",
    magicpenFormat: "html",
    generateOutput: async maker => (await maker.withInlinedExamples()).toText()
  },
  markdown: {
    defaultExtension: ".md",
    magicpenFormat: "text",
    generateOutput: async maker => (await maker.withUpdatedExamples()).toText()
  }
};

const captures = {
  console: true,
  nowrap: true,
  return: true
};

function isValidExtension(ext) {
  return typeof ext === "string" && /^\.([a-z]\.)*[a-z]/;
}

function noopWrapper(output) {
  return output;
}

class Evaldown {
  constructor(options) {
    options = options || {};

    const {
      commentMarker,
      fileGlobals,
      filePreamble,
      outputCapture,
      outputFormat,
      wrapOutput,
      sourceExtension,
      targetExtension
    } = options;

    const formatName = typeof outputFormat === "string" ? outputFormat : "html";
    if (!Evaldown.formats[formatName]) {
      throw new Error(`Evaldown: Unsupported output format "${outputFormat}"`);
    }

    const captureName =
      typeof outputCapture === "string" ? outputCapture : "return";
    if (!Evaldown.captures[captureName]) {
      throw new Error(`Evaldown: Unsupported capture type "${outputCapture}"`);
    }

    const marker =
      typeof commentMarker === "string" ? commentMarker : "evaldown";
    const preamble =
      typeof filePreamble === "string" ? filePreamble : undefined;
    const wrapper = typeof wrapOutput === "function" ? wrapOutput : noopWrapper;

    this.capture = captureName;
    this.format = Evaldown.formats[formatName];
    this.formatName = formatName;
    this.marker = marker;
    this.preamble = preamble;
    this.wrapper = wrapper;

    // target handling
    this.inplace = !!options.inplace;
    this.update = !!options.update;

    // path handling
    this.requirePath = options.requirePath;
    this.sourcePath = options.sourcePath;
    this.targetPath = options.targetPath;
    this.tsconfigPath = options.tsconfigPath;

    // extension handling
    this.sourceExtension = isValidExtension(sourceExtension)
      ? sourceExtension
      : DEFAULT_SOURCE_EXTENSION;
    this.targetExtension = isValidExtension(targetExtension)
      ? targetExtension
      : this.format.defaultExtension;

    // evaluation configuration
    this.fileGlobals =
      typeof fileGlobals === "object" && fileGlobals ? fileGlobals : {};
  }

  async makeOutputForContent(fileContent, pwdPath) {
    const maker = new Markdown(fileContent, {
      marker: this.marker,
      format: this.formatName,
      inplace: this.inplace,
      preamble: this.preamble,
      requirePath: this.requirePath,
      tsconfigPath: this.tsconfigPath
    });

    // set basic options for evaluation
    const evalOpts = { pwdPath, capture: this.capture };
    // set globals to be attached if supplied
    if (this.fileGlobals) {
      evalOpts.fileGlobals = this.fileGlobals;
    }
    // trigger evaluation for this bag of options
    await maker.evaluate(evalOpts);

    const targetOutput = await this.format.generateOutput(maker);

    let sourceOutput;
    if (!(this.inplace || this.update)) {
      sourceOutput = null;
    } else if (this.formatName === "markdown") {
      sourceOutput = targetOutput;
    } else {
      const markdownFormat = Evaldown.formats.markdown;
      sourceOutput = await markdownFormat.generateOutput(maker);
    }

    return { targetOutput, sourceOutput };
  }

  async prepareFile(sourceFile) {
    debug('preparing source file "%s"', sourceFile);

    const sourceBaseName = path.basename(sourceFile, this.sourceExtension);
    const sourceDirName = path.dirname(sourceFile);
    const sourceFilePath = path.join(this.sourcePath, sourceFile);

    let fileContent;
    try {
      fileContent = await fs.readFile(sourceFilePath, "utf8");
    } catch (e) {
      throw new errors.SourceFileError(e);
    }

    const pwdPath = path.join(this.sourcePath, sourceDirName);
    const output = await this.makeOutputForContent(fileContent, pwdPath);

    return {
      sourceFile,
      sourceBaseName,
      sourceDirName,
      sourceFilePath,
      ...output
    };
  }

  async processFile(sourceFile) {
    const prepared = await this.prepareFile(sourceFile);

    debug('processing source file "%s"', sourceFile);

    if (!this.inplace && this.targetPath) {
      await this.writeFile(prepared);
    }

    if (this.inplace || this.update) {
      await this.updateFile(prepared);
    }
  }

  async processFiles() {
    debug('reading files for processing "%s"', this.sourcePath);

    const markdownFiles = await glob(`**/*${this.sourceExtension}`, {
      cwd: this.sourcePath
    });

    const stats = new Stats();

    for (const file of markdownFiles) {
      try {
        await this.processFile(file);
        stats.addSuccess(file);
      } catch (e) {
        stats.addError(file, e);
        debug('unable to process "%s" with: %s', file, errors.errorToOutput(e));
      }
    }

    debug('finished processing "%s"', this.sourcePath);

    return stats;
  }

  async updateFile(prepared) {
    const { sourceFile, sourceFilePath, sourceOutput } = prepared;

    debug('updating source file "%s"', sourceFile);

    try {
      await fs.writeFile(sourceFilePath, sourceOutput, "utf8");
    } catch (e) {
      throw new errors.InplaceFileError(e);
    }
  }

  async writeFile(prepared) {
    const {
      sourceFile,
      sourceBaseName,
      sourceDirName,
      targetOutput
    } = prepared;

    debug('writing target for source file "%s"', sourceFile);

    const targetFile = path.join(
      sourceDirName,
      `${sourceBaseName}${this.targetExtension}`
    );
    const targetFilePath = path.join(this.targetPath, targetFile);
    try {
      await fsExtra.ensureDir(path.dirname(targetFilePath));

      const context = {
        sourceFile,
        targetFile
      };
      await fs.writeFile(
        targetFilePath,
        this.wrapper(targetOutput, context),
        "utf8"
      );
    } catch (e) {
      throw new errors.TargetFileError(e);
    }
  }
}

Evaldown.captures = captures;
Evaldown.formats = formats;
Evaldown.Markdown = Markdown;

module.exports = Evaldown;
