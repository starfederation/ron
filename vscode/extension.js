"use strict";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function pushToken(tokens, type, value) {
  if (!value) {
    return;
  }
  tokens.push(type ? `<span class="${type}">${escapeHtml(value)}</span>` : escapeHtml(value));
}

function isWhitespace(char) {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function isDelimiter(char) {
  return !char || isWhitespace(char) || char === "{" || char === "}" || char === "[" || char === "]" || char === "\"" || char === "'" || char === ",";
}

function isTokenStart(code, pos) {
  if (pos === 0) {
    return true;
  }
  const previous = code[pos - 1];
  return isWhitespace(previous) || previous === "{" || previous === "[" || previous === ",";
}

function apostropheIsToken(code, pos) {
  if (code[pos + 1] && !isDelimiter(code[pos + 1])) {
    return false;
  }
  for (let i = pos + 2; i < code.length; i += 1) {
    if (code[i] === "'") {
      return false;
    }
    if (code[i] === "{" || code[i] === "}" || code[i] === "[" || code[i] === "]") {
      return true;
    }
  }
  return true;
}

function quotedEnd(code, pos) {
  const quote = code[pos];
  let count = 0;
  while (code[pos + count] === quote) {
    count += 1;
  }

  const after = code[pos + count];
  if (isDelimiter(after)) {
    if (count % 2 === 0 || (count >= 5 && (count - 2) % 3 === 0)) {
      return pos + count;
    }
  }

  let end = pos + count;
  while (end < code.length) {
    const next = code.indexOf(quote, end);
    if (next === -1) {
      return code.length;
    }
    let run = 0;
    while (code[next + run] === quote) {
      run += 1;
    }
    if (run >= count) {
      return next + count;
    }
    end = next + run;
  }
  return code.length;
}

function commaPrefixedEnd(code, pos) {
  let end = pos + 1;
  while (end < code.length && !isDelimiter(code[end])) {
    end += 1;
  }
  return end;
}

function highlightRON(code) {
  const tokens = [];
  let i = 0;

  while (i < code.length) {
    const rest = code.slice(i);

    if (rest[0] === "," && isTokenStart(code, i)) {
      const end = commaPrefixedEnd(code, i);
      pushToken(tokens, "ron-ident", code.slice(i, end));
      i = end;
      continue;
    }

    if (rest[0] === "'" && apostropheIsToken(code, i)) {
      pushToken(tokens, "ron-ident", "'");
      i += 1;
      continue;
    }

    if (rest[0] === "\"" || rest[0] === "'") {
      const end = quotedEnd(code, i);
      pushToken(tokens, "ron-string", code.slice(i, end));
      i = end;
      continue;
    }

    const match =
      /^(true|false|null)(?![A-Za-z0-9_./!$%&*+=<>:-])/.exec(rest) ||
      /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?(?![A-Za-z0-9_./!$%&*+=<>:-])/.exec(rest) ||
      /^\?[A-Za-z0-9_./!$%&*+=<>:-]+/.exec(rest) ||
      /^#_[A-Za-z0-9_./!$%&*+=<>:-]+/.exec(rest) ||
      /^#[A-Za-z0-9_./!$%&*+=<>:-]*/.exec(rest) ||
      /^[{}]/.exec(rest) ||
      /^[\[\]]/.exec(rest) ||
      /^[^ \t\r\n[\]{}'",]+/.exec(rest);

    if (match) {
      const value = match[0];
      let type = "ron-ident";
      if (value === "true" || value === "false" || value === "null") {
        type = "ron-literal";
      } else if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) {
        type = "ron-number";
      } else if (value[0] === "?") {
        type = "ron-var";
      } else if (value.startsWith("#_")) {
        type = "ron-tempid";
      } else if (value[0] === "#") {
        type = "ron-tag";
      } else if (value === "{" || value === "}") {
        type = "ron-brace";
      } else if (value === "[" || value === "]") {
        type = "ron-bracket";
      }
      pushToken(tokens, type, value);
      i += value.length;
      continue;
    }

    pushToken(tokens, "", code[i]);
    i += 1;
  }

  return tokens.join("");
}

function isRONFence(info) {
  return info.trim().split(/\s+/, 1)[0].toLowerCase() === "ron";
}

function activate() {
  return {
    extendMarkdownIt(md) {
      const defaultFence =
        md.renderer.rules.fence ||
        function fence(tokens, idx, options, env, self) {
          return self.renderToken(tokens, idx, options);
        };

      md.renderer.rules.fence = function fence(tokens, idx, options, env, self) {
        const token = tokens[idx];
        if (!isRONFence(token.info || "")) {
          return defaultFence(tokens, idx, options, env, self);
        }

        const attrs = token.attrIndex("class") >= 0 ? token.attrs.slice() : [];
        if (token.attrIndex("class") >= 0) {
          const classAttr = attrs[token.attrIndex("class")];
          attrs[token.attrIndex("class")] = [classAttr[0], `${classAttr[1]} hljs language-ron`];
        } else {
          attrs.push(["class", "hljs language-ron"]);
        }

        return `<pre><code${self.renderAttrs({ attrs })}>${highlightRON(token.content)}</code></pre>\n`;
      };

      return md;
    },
  };
}

module.exports = {
  activate,
};
