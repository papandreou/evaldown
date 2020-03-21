const expect = require("unexpected")
  .clone()
  .use(require("unexpected-sinon"));
const fsExtra = require("fs-extra");
const path = require("path");
const sinon = require("sinon");

const Evaldown = require("../lib/Evaldown");

const TESTDATA_PATH = path.join(__dirname, "..", "testdata");
const TESTDATA_OUTPUT_PATH = path.join(TESTDATA_PATH, "output");

describe("Evaldown", () => {
  before(async () => {
    await fsExtra.ensureDir(TESTDATA_OUTPUT_PATH);
  });

  beforeEach(async () => {
    await fsExtra.emptyDir(TESTDATA_OUTPUT_PATH);
  });

  it("should be a function", () => {
    expect(Evaldown, "to be a function");
  });

  it("should allow creating an instance", () => {
    expect(new Evaldown(), "to be an", Evaldown);
  });

  describe("processFiles()", function() {
    it("should generate files", async function() {
      const evaldown = new Evaldown({
        sourcePath: path.join(TESTDATA_PATH, "example"),
        targetPath: TESTDATA_OUTPUT_PATH
      });

      await evaldown.processFiles();

      // check the file was created
      const expectedOutputFile = path.join(TESTDATA_OUTPUT_PATH, "expect.html");
      await expect(
        () => fsExtra.pathExists(expectedOutputFile),
        "to be fulfilled with",
        true
      );
    });
  });

  describe("with nested folders", () => {
    it("should generate the tree", async function() {
      const evaldown = new Evaldown({
        sourcePath: path.join(TESTDATA_PATH, "nested"),
        targetPath: TESTDATA_OUTPUT_PATH
      });

      await evaldown.processFiles();

      // check the file was created
      const expectedOutputFile = path.join(
        TESTDATA_OUTPUT_PATH,
        "child",
        "inner.html"
      );
      await expect(
        () => fsExtra.pathExists(expectedOutputFile),
        "to be fulfilled with",
        true
      );
    });
  });

  describe("with customised extensions", function() {
    it("should glob for the supplied extension", async function() {
      const evaldown = new Evaldown({
        sourcePath: path.join(TESTDATA_PATH, "extensions"),
        sourceExtension: ".markdown",
        targetPath: TESTDATA_OUTPUT_PATH
      });

      await evaldown.processFiles();

      // check the file was created
      const expectedOutputFile = path.join(TESTDATA_OUTPUT_PATH, "expect.html");
      await expect(
        () => fsExtra.pathExists(expectedOutputFile),
        "to be fulfilled with",
        true
      );
    });

    it("should output the supplied target extension", async function() {
      const evaldown = new Evaldown({
        sourcePath: path.join(TESTDATA_PATH, "example"),
        targetPath: TESTDATA_OUTPUT_PATH,
        targetExtension: ".ko"
      });

      await evaldown.processFiles();

      // check the file was created
      const expectedOutputFile = path.join(TESTDATA_OUTPUT_PATH, "expect.ko");
      await expect(
        () => fsExtra.pathExists(expectedOutputFile),
        "to be fulfilled with",
        true
      );
    });
  });

  describe("with customised template", function() {
    it("should include the template function result in the output", async function() {
      const evaldown = new Evaldown({
        template: output => `<!-- SILLY OLD MARKER -->\n${output}`,
        sourcePath: path.join(TESTDATA_PATH, "example"),
        targetPath: TESTDATA_OUTPUT_PATH
      });

      await evaldown.processFiles();

      const targetFilePath = path.join(TESTDATA_OUTPUT_PATH, "expect.html");
      const targetSource = await fsExtra.readFile(targetFilePath, "utf8");
      expect.withError(
        () => {
          expect(targetSource, "to start with", "<!-- SILLY OLD MARKER -->");
        },
        () => {
          expect.fail({
            message: "The updated output was not in the target file."
          });
        }
      );
    });

    it("should call the template function passing output and context", async function() {
      const evaldown = new Evaldown({
        sourcePath: path.join(TESTDATA_PATH, "example"),
        targetPath: TESTDATA_OUTPUT_PATH
      });
      sinon.spy(evaldown, "template");

      await evaldown.processFiles();

      expect(evaldown.template, "to have calls satisfying", [
        [
          expect.it("to be a string"),
          {
            sourceFile: "expect.md",
            targetFile: "expect.html"
          }
        ]
      ]);
    });
  });

  describe("when operating in update mode", function() {
    it("should glob for the supplied extension", async function() {
      const sourceFile = "expect.md";
      const sourceFilePath = path.join(TESTDATA_PATH, "example", sourceFile);
      const originalSource = await fsExtra.readFile(sourceFilePath, "utf8");

      await new Evaldown({
        update: true,
        sourcePath: path.dirname(sourceFilePath),
        targetPath: TESTDATA_OUTPUT_PATH
      }).processFile(sourceFile);

      try {
        const updatedSource = await fsExtra.readFile(sourceFilePath, "utf8");
        expect.withError(
          () => {
            expect(updatedSource, "not to equal", originalSource);
          },
          () => {
            expect.fail({ message: "The source file was not updated." });
          }
        );
      } finally {
        await fsExtra.writeFile(sourceFilePath, originalSource, "utf8");
      }
    });
  });
});
