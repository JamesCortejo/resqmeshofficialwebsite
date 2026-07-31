function quoteCamelCaseAliases(sql) {
  return sql.replace(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/g, (match, alias) => {
    return /[A-Z]/.test(alias) ? `AS "${alias}"` : match;
  });
}

function quoteCamelCaseQualifiedReferences(sql) {
  return sql.replace(/\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*[A-Z][A-Za-z0-9_]*)\b/g, '$1."$2"');
}

function convertPlaceholders(sql) {
  let output = '';
  let index = 1;
  let quote = null;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        output += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else {
        output += char;
      }
      continue;
    }

    if (quote) {
      output += char;

      if (char === quote) {
        if (quote === "'" && next === "'") {
          output += next;
          i += 1;
        } else {
          quote = null;
        }
      }

      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      output += char;
      continue;
    }

    if (char === '$') {
      const tagMatch = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (tagMatch) {
        dollarTag = tagMatch[0];
        output += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (char === '?') {
      output += `$${index}`;
      index += 1;
    } else {
      output += char;
    }
  }

  return output;
}

function splitTopLevelArguments(value) {
  const args = [];
  let current = '';
  let depth = 0;
  let quote = null;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const next = value[i + 1];

    if (quote) {
      current += char;
      if (char === quote) {
        if (quote === "'" && next === "'") {
          current += next;
          i += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      current += char;
      continue;
    }

    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() || value.trim() === '') {
    args.push(current.trim());
  }

  return args;
}

function convertSqliteDateCall(functionName, body) {
  const args = splitTopLevelArguments(body);
  const first = args[0] || '';
  const modifier = args[1] || '';
  const cast = functionName.toLowerCase() === 'date' ? '::date' : '';

  if (/^'now'$/i.test(first)) {
    if (/^'-\d+\s+day'$/i.test(modifier)) {
      const days = modifier.match(/\d+/)[0];
      return `(CURRENT_DATE - INTERVAL '${days} days')${cast}`;
    }

    if (/^'\+\d+\s+day'$/i.test(modifier)) {
      const days = modifier.match(/\d+/)[0];
      return `(CURRENT_DATE + INTERVAL '${days} days')${cast}`;
    }

    return functionName.toLowerCase() === 'date' ? 'CURRENT_DATE' : 'CURRENT_TIMESTAMP';
  }

  if (/^'\+\d+\s+day'$/i.test(modifier)) {
    const days = modifier.match(/\d+/)[0];
    return `(${first} + INTERVAL '${days} days')${cast}`;
  }

  if (/^'-\d+\s+day'$/i.test(modifier)) {
    const days = modifier.match(/\d+/)[0];
    return `(${first} - INTERVAL '${days} days')${cast}`;
  }

  return `(${body})${cast}`;
}

function convertSqliteDateFunctions(sql) {
  let output = '';
  let index = 0;

  while (index < sql.length) {
    const match = sql.slice(index).match(/\b(datetime|date)\s*\(/i);

    if (!match) {
      output += sql.slice(index);
      break;
    }

    const functionStart = index + match.index;
    const functionName = match[1];
    const openParenIndex = functionStart + match[0].lastIndexOf('(');

    output += sql.slice(index, functionStart);

    let depth = 0;
    let quote = null;
    let closeParenIndex = -1;

    for (let i = openParenIndex; i < sql.length; i += 1) {
      const char = sql[i];
      const next = sql[i + 1];

      if (quote) {
        if (char === quote) {
          if (quote === "'" && next === "'") {
            i += 1;
          } else {
            quote = null;
          }
        }
        continue;
      }

      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }

      if (char === '(') {
        depth += 1;
        continue;
      }

      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          closeParenIndex = i;
          break;
        }
      }
    }

    if (closeParenIndex === -1) {
      output += sql.slice(functionStart);
      break;
    }

    const body = sql.slice(openParenIndex + 1, closeParenIndex);
    output += convertSqliteDateCall(functionName, body);
    index = closeParenIndex + 1;
  }

  return output;
}

function prepareSql(sql) {
  return convertPlaceholders(
    convertSqliteDateFunctions(
      quoteCamelCaseQualifiedReferences(quoteCamelCaseAliases(sql))
    )
  );
}

module.exports = {
  prepareSql
};
