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
  return Boolean(char) && /^\p{White_Space}$/u.test(char);
}

function isDelimiter(char) {
  return !char || isWhitespace(char) || char === "{" || char === "}" || char === "[" || char === "]" || char === "\"" || char === "'" || char === ",";
}

function escapeEnd(code, pos) {
  const simple = "\"\\/bfnrt";
  const next = code[pos + 1];
  if (next && simple.includes(next)) {
    return pos + 2;
  }
  if (next === "u" && /^[0-9a-fA-F]{4}$/.test(code.slice(pos + 2, pos + 6))) {
    const codeUnit = Number.parseInt(code.slice(pos + 2, pos + 6), 16);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (code.slice(pos + 6, pos + 8) === "\\u" && /^[dD][c-fC-F][0-9a-fA-F]{2}$/.test(code.slice(pos + 8, pos + 12))) {
        return pos + 12;
      }
      return pos + 1;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return pos + 1;
    }
    return pos + 6;
  }
  return pos + 1;
}

function bareTokenEnd(code, pos) {
  let end = pos;
  while (end < code.length) {
    if (code[end] === "\\") {
      const escapedEnd = escapeEnd(code, end);
      if (escapedEnd > end + 1) {
        end = escapedEnd;
        continue;
      }
    }
    if (isDelimiter(code[end])) {
      break;
    }
    end += 1;
  }
  return end;
}

function isTokenStart(code, pos) {
  if (pos === 0) {
    return true;
  }
  const previous = code[pos - 1];
  return isWhitespace(previous) || previous === "{" || previous === "[" || previous === ",";
}

function apostropheIsToken(code, pos) {
  if (code[pos + 1] === "'") {
    return false;
  }
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
    if (count % 2 === 0 || (quote === "'" && count >= 5 && (count - 2) % 3 === 0)) {
      return pos + count;
    }
  }

  let end = pos + count;
  while (end < code.length) {
    if (code[end] === "\\") {
      const escapedEnd = escapeEnd(code, end);
      if (escapedEnd > end + 1) {
        end = escapedEnd;
        continue;
      }
    }
    if (code[end] !== quote) {
      end += 1;
      continue;
    }
    let run = 0;
    while (code[end + run] === quote) {
      run += 1;
    }
    if (run >= count) {
      return end + count;
    }
    end += run;
  }
  return code.length;
}

function commaPrefixedEnd(code, pos) {
  return bareTokenEnd(code, pos + 1);
}

function bareTokenIsInvalid(code, pos, end) {
  for (let i = pos; i < end;) {
    if (code[i] === "\\") {
      const escapedEnd = escapeEnd(code, i);
      if (escapedEnd === i + 1) {
        return true;
      }
      i = escapedEnd;
      continue;
    }
    if (code.charCodeAt(i) <= 0x1f) {
      return true;
    }
    i += 1;
  }
  return false;
}

function quotedContentIsInvalid(code, pos, end) {
  const quote = code[pos];
  let count = 0;
  while (code[pos + count] === quote) {
    count += 1;
  }

  const contentEnd = end - count;
  for (let i = pos + count; i < contentEnd;) {
    if (code[i] === "\\") {
      const escapedEnd = escapeEnd(code, i);
      if (escapedEnd === i + 1) {
        return true;
      }
      i = escapedEnd;
      continue;
    }
    if (code.charCodeAt(i) <= 0x1f) {
      return true;
    }
    i += 1;
  }
  return false;
}

function highlightRON(code) {
  const tokens = [];
  let i = 0;

  while (i < code.length) {
    const rest = code.slice(i);

    if (rest[0] === "," && isTokenStart(code, i)) {
      const end = commaPrefixedEnd(code, i);
      const type = bareTokenIsInvalid(code, i, end) ? "ron-invalid" : "ron-ident";
      pushToken(tokens, type, code.slice(i, end));
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
      const type = quotedContentIsInvalid(code, i, end) ? "ron-invalid" : "ron-string";
      pushToken(tokens, type, code.slice(i, end));
      i = end;
      continue;
    }

    const punctuation = /^[{}]/.exec(rest) || /^[\[\]]/.exec(rest);
    if (punctuation) {
      const value = punctuation[0];
      pushToken(tokens, value === "{" || value === "}" ? "ron-brace" : "ron-bracket", value);
      i += value.length;
      continue;
    }

    if (!isDelimiter(rest[0])) {
      const end = bareTokenEnd(code, i);
      const value = code.slice(i, end);
      let type = bareTokenIsInvalid(code, i, end) ? "ron-invalid" : "ron-ident";
      if (type !== "ron-invalid") {
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
        }
      }
      pushToken(tokens, type, value);
      i = end;
      continue;
    }

    pushToken(tokens, "", code[i]);
    i += 1;
  }

  return tokens.join("");
}

function isRONFence(info) {
  const language = info.trim().split(/\s+/, 1)[0].toLowerCase();
  return language === "ron";
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
