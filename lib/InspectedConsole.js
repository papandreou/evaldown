const symbols = {
  expect: Symbol("expect"),
  isEmpty: Symbol("isEmpty"),
  line: Symbol("line"),
  markdown: Symbol("markdown"),
  output: Symbol("output"),
  reset: Symbol("reset"),
  toString: Symbol("toSting")
};

function makeBoundConsoleMethod(out, con) {
  return function(first, ...rest) {
    if (typeof first === "string") {
      this[symbols.line](out, first);
    } else {
      for (const obj of [first, ...rest]) {
        this[symbols.line](out, obj);
      }
    }
  }.bind(con);
}

function stringToOutput(content, output, isError) {
  output = output.clone();
  const stringStyle = isError ? "error" : "jsString";
  const appendString = str => output[stringStyle](str);

  appendString("'");
  appendString(
    // eslint-disable-next-line no-control-regex
    content.replace(/[\\\x00-\x1f']/g, $0 => {
      if ($0 === "\n") {
        return "\\n";
      } else if ($0 === "\r") {
        return "\\r";
      } else if ($0 === "'") {
        return "\\'";
      } else if ($0 === "\\") {
        return "\\\\";
      } else if ($0 === "\t") {
        return "\\t";
      } else if ($0 === "\b") {
        return "\\b";
      } else if ($0 === "\f") {
        return "\\f";
      } else {
        const charCode = $0.charCodeAt(0);
        return `\\x${charCode < 16 ? "0" : ""}${charCode.toString(16)}`;
      }
    })
  );
  appendString("'");

  return output;
}

function noopMethod() {}

class InspectedConsole {
  constructor(markdown) {
    this[symbols.markdown] = markdown;
    this[symbols.output] = [];

    this.log = makeBoundConsoleMethod("stdout", this);
    this.info = makeBoundConsoleMethod("stdout", this);
    this.warn = makeBoundConsoleMethod("stderr", this);
    this.error = makeBoundConsoleMethod("stderr", this);

    // Stub trace, time, timeEnd etc.
    for (const key of Object.keys(console)) {
      if (typeof console[key] === "function" && !this[key]) {
        this[key] = noopMethod;
      }
    }
  }

  get [symbols.expect]() {
    return this[symbols.markdown].getExpect();
  }

  [symbols.isEmpty]() {
    return this[symbols.output].length === 0;
  }

  [symbols.line](out, value) {
    if (typeof value !== "string") {
      value = this[symbols.expect].inspect(value, 6);
    } else {
      value = stringToOutput(
        value,
        this[symbols.expect].output,
        out === "stderr"
      );
    }
    this[symbols.output].push(value);
  }

  [symbols.reset]() {
    this[symbols.output] = [];
  }

  [symbols.toString](format) {
    const lines = this[symbols.output];

    // early exit if there was no output
    if (lines.length === 0) return "";

    const output = this[symbols.expect].output.clone();
    // handle the first line
    output.append(lines[0]);
    // now add other lines with spaces between
    const remainingLines = lines.slice(1);
    for (const line of remainingLines) {
      output.nl().append(line);
    }
    return output.toString(format);
  }
}

InspectedConsole.symbols = symbols;

module.exports = InspectedConsole;
