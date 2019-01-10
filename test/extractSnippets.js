const extractSnippets = require('../lib/extractSnippets');
const expect = require('unexpected');

describe('extractSnippets', function() {
  it('should extract a snippet between some markdown sections', function() {
    expect(
      extractSnippets(
        '# foo\n\n```javascript\nalert("Hello!");\n```\n\n# bar\n'
      ),
      'to satisfy',
      [{ code: 'alert("Hello!");' }]
    );
  });

  it('should multiple snippets', function() {
    expect(
      extractSnippets(
        '```js\nalert("Hello!");\n```\n\n```js\nalert("world!");\n```\n'
      ),
      'to satisfy',
      [{ code: 'alert("Hello!");' }, { code: 'alert("world!");' }]
    );
  });

  it('should normalize js to javascript', function() {
    expect(extractSnippets('```js\nalert("Hello!");\n```\n'), 'to satisfy', [
      { lang: 'javascript', code: 'alert("Hello!");' }
    ]);
  });

  it('should default to evaluate:true', function() {
    expect(extractSnippets('```js\nalert("Hello!");\n```\n'), 'to satisfy', [
      { flags: { evaluate: true } }
    ]);
  });

  it('should allow changing evaluate to false via js#evaluate:false', function() {
    expect(
      extractSnippets('```js#evaluate:false\nalert("Hello!");\n```\n'),
      'to satisfy',
      [{ flags: { evaluate: false } }]
    );
  });

  it('should allow changing evaluate to false via a preceding HTML comment', function() {
    expect(
      extractSnippets(
        '<!-- evaluate:false -->\n```js\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ flags: { evaluate: false } }]
    );
  });

  it('should extract a flag after the language specifier and #', function() {
    expect(
      extractSnippets('```js#foo:true\nalert("Hello!");\n```\n'),
      'to satisfy',
      [{ flags: { foo: true } }]
    );
  });

  it('should extract multiple comma-separated flags after the language specifier and #', function() {
    expect(
      extractSnippets('```js#foo:true,bar:false\nalert("Hello!");\n```\n'),
      'to satisfy',
      [{ flags: { foo: true, bar: false } }]
    );
  });

  it('should extract a flag from a preceding HTML comment', function() {
    expect(
      extractSnippets('<!-- foo:true -->\n```js\nalert("Hello!");\n```\n'),
      'to satisfy',
      [{ flags: { foo: true } }]
    );
  });

  it('should extract multiple comma-separated flags from a preceding HTML comment', function() {
    expect(
      extractSnippets(
        '<!-- foo:true,bar:false -->\n```js\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ flags: { foo: true, bar: false } }]
    );
  });

  it('should tolerate whitespace between the flags and commans in the preceding HTML comment', function() {
    expect(
      extractSnippets(
        '<!-- foo : true , bar : false -->\n```js\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ flags: { foo: true, bar: false } }]
    );
  });

  it('should extract flags from both a preceding HTML command and after the language specifier and #', function() {
    expect(
      extractSnippets(
        '<!-- foo:true -->\n```js#bar:false\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ flags: { foo: true, bar: false } }]
    );
  });

  it('should let the flags after the language specifier win when the same flag is provided in both places', function() {
    expect(
      extractSnippets(
        '<!-- foo:true -->\n```js#foo:false\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ flags: { foo: false } }]
    );
  });

  it('provides the index of the block', function() {
    expect(
      extractSnippets('foobar\n```js#foo:false\nalert("Hello!");\n```\n'),
      'to satisfy',
      [{ index: 7 }]
    );
  });

  it('skips past a preceding HTML comment when providing the index', function() {
    expect(
      extractSnippets(
        'foobar\n<!-- foo: bar -->\n```js#foo:false\nalert("Hello!");\n```\n'
      ),
      'to satisfy',
      [{ index: 25 }]
    );
  });
});
