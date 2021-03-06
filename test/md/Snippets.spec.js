const buble = require("buble");
const expect = require("unexpected");

const errors = require("../../lib/errors");
const Snippets = require("../../lib/md/Snippets");

function createFakeMarkdown() {
  return {
    getExpect() {
      return expect;
    },
    setExpect() {}
  };
}

const testSnippets = [
  {
    lang: "javascript",
    flags: { evaluate: true },
    index: 24,
    code:
      'throw new Error("foo\\n  at bar (/somewhere.js:1:2)\\n  at quux (/blah.js:3:4)\\n  at baz (/yadda.js:5:6)")'
  },
  {
    lang: "output",
    flags: { cleanStackTrace: true, evaluate: true },
    index: 148,
    code:
      "foo\n  at bar (/path/to/file.js:x:y)\n  at quux (/path/to/file.js:x:y)"
  }
];

describe("Snippets", () => {
  it("should allow retrieving a snippet by index", () => {
    const snippets = new Snippets(testSnippets);

    expect(snippets.get(1), "to equal", testSnippets[1]);
  });

  describe("#check()", () => {
    it("should record and wrap a check error", async () => {
      const snippets = new Snippets([
        {
          code: "I've been orphaned!",
          lang: "output"
        }
      ]);

      const result = snippets.check();

      expect(result, "to satisfy", {
        0: expect
          .it("to be an", errors.SnippetProcessingError)
          .and("to have message", "no matching code block for output snippet")
          .and("to satisfy", {
            data: { original: expect.it("to be an", Error) }
          })
      });
    });
  });

  describe("#evaluate()", () => {
    it("should reject if called twice", async () => {
      const snippets = new Snippets([]);
      await snippets.evaluate({
        markdown: createFakeMarkdown(),
        pwdPath: __dirname
      });

      await expect(
        () => snippets.evaluate(),
        "to be rejected with",
        "the same snippets were evaluated twice"
      );
    });

    it("should reject and wrap evaluation errors", async () => {
      const snippets = new Snippets([
        {
          code: "I've been orphaned!",
          lang: "output"
        }
      ]);

      await expect(
        () =>
          snippets.evaluate({
            markdown: createFakeMarkdown(),
            pwdPath: __dirname
          }),
        "to be rejected with",
        expect
          .it("to be an", errors.FileEvaluationError)
          .and("to have message", "")
          .and("to satisfy", {
            data: {
              errors: {
                0: expect.it("to be an", errors.SnippetProcessingError)
              }
            }
          })
      );
    });

    describe("when transpiled", () => {
      it("should transpile and evaluate the code (per-snippet capture)", async () => {
        const transpileFn = content => buble.transform(content).code;
        const snippets = new Snippets([
          {
            lang: "javascript",
            flags: { evaluate: true, return: true },
            code: `
              class SomeClass {
                constructor() {
                  this.foo = true
                }
              }

              return new SomeClass().foo ? 'yay' : 'nay'
            `
          }
        ]);

        await snippets.evaluate({
          markdown: createFakeMarkdown(),
          pwdPath: __dirname,
          capture: "console",
          transpileFn
        });

        expect(snippets.items[0], "to satisfy", {
          transpiled: expect.it("to start with", "(function () {"),
          output: {
            kind: "result",
            text: "'yay'"
          }
        });
      });

      it("should transpile and evaluate the code (global capture)", async () => {
        const transpileFn = content => buble.transform(content).code;
        const snippets = new Snippets([
          {
            lang: "javascript",
            flags: { evaluate: true },
            code: `
              class SomeClass {
                constructor() {
                  this.foo = true
                }
              }

              return new SomeClass().foo ? 'yay' : 'nay'
            `
          }
        ]);

        await snippets.evaluate({
          markdown: createFakeMarkdown(),
          pwdPath: __dirname,
          capture: "return",
          transpileFn
        });

        expect(snippets.items[0], "to satisfy", {
          transpiled: expect.it("to start with", "(function () {"),
          output: {
            kind: "result",
            text: "'yay'"
          }
        });
      });

      it("should preserve a pre-existing preamble", async () => {
        const transpileFn = content => buble.transform(content).code;
        const snippets = new Snippets([
          {
            lang: "javascript",
            flags: { evaluate: true },
            code: `
                class SomeClass {
                  constructor() {
                    this.foo = fileGlobalFunction()
                  }
                }

                return new SomeClass().foo
              `
          }
        ]);

        await snippets.evaluate({
          markdown: createFakeMarkdown(),
          pwdPath: __dirname,
          capture: "return",
          preamble: "function fileGlobalFunction() { return 'foo'; }",
          transpileFn
        });

        expect(snippets.items[0], "to satisfy", {
          output: {
            kind: "result",
            text: "'foo'"
          }
        });
      });

      describe("with typescript", () => {
        it("should reject if a conflicting transpileFn was supplied", async function() {
          const snippets = new Snippets([
            {
              lang: "typescript",
              flags: { evaluate: true }
            }
          ]);

          await expect(
            () => snippets.evaluate({ transpileFn: () => {} }),
            "to be rejected with",
            "transpileFn cannot be specified with TypeScript snippets"
          );
        });

        it("should reject if no tsconfig file is specified", async function() {
          const snippets = new Snippets([
            {
              lang: "typescript",
              flags: { evaluate: true }
            }
          ]);

          await expect(
            () => snippets.evaluate({}),
            "to be rejected with",
            "tsconfig must be specified with TypeScript snippets"
          );
        });
      });
    });
  });

  describe("#getTests()", () => {
    it("should combine each code/output pair", () => {
      const snippets = new Snippets(
        testSnippets.map(snippet => ({ ...snippet, evaluate: false }))
      );

      expect(snippets.getTests(), "to satisfy", [
        {
          code:
            'throw new Error("foo\\n  at bar (/somewhere.js:1:2)\\n  at quux (/blah.js:3:4)\\n  at baz (/yadda.js:5:6)")',
          flags: { evaluate: true },
          output:
            "foo\n  at bar (/path/to/file.js:x:y)\n  at quux (/path/to/file.js:x:y)"
        }
      ]);
    });

    it("should throw if an output block was not preceded by a source block", () => {
      const snippets = new Snippets([
        {
          code: "I've been orphaned!",
          lang: "output"
        }
      ]);

      expect(
        () => {
          snippets.getTests();
        },
        "to throw",
        "no matching code block for output snippet"
      );
    });

    it("should throw if an output block was preceded by a hidden block", () => {
      const snippets = new Snippets([
        {
          code: "You can't see me",
          lang: "javascript",
          flags: {
            evaluate: true,
            hide: true
          }
        },
        {
          code: "I'm not supposed to be here!",
          lang: "output"
        }
      ]);

      expect(
        () => {
          snippets.getTests();
        },
        "to throw",
        "cannot match hidden code block to output snippet"
      );
    });
  });

  describe("Snippets.fromMarkdown()", () => {
    it("should extract the snippets", () => {
      const snippets = Snippets.fromMarkdown(
        [
          "Asserts deep equality.",
          "",
          "```javascript",
          'throw new Error("foo\\n  at bar (/somewhere.js:1:2)\\n  at quux (/blah.js:3:4)\\n  at baz (/yadda.js:5:6)")',
          "```",
          "",
          "<!-- evaldown cleanStackTrace:true -->",
          "```output",
          "foo",
          "  at bar (/path/to/file.js:x:y)",
          "  at quux (/path/to/file.js:x:y)",
          "```"
        ].join("\n"),
        { marker: "evaldown" }
      );

      expect(snippets.items, "to satisfy", testSnippets);
    });
  });
});
