const data = [
  { b: true, i: 16, f: 33.5, s: "hello", l: [2, 5, 7] },
  { b: false, i: 23, f: 11.5, s: "x", l: [] },
  { b: true, i: 23, f: 73.5, l: [2, 5, 7] },
  { b: true, i: 12, f: 73.5, s: null, l: [1, 5, 7] },
  { b: true, i: 25, f: 53.5, s: undefined, l: [9, 5, 7] },
  { b: true, i: 26, f: 43.5, s: "no", l: [7, 5, 7] },
  { b: true, i: 17, f: 33.5, s: "hello 2", l: [3, 7] },
  { b: true, i: 28, f: 23.5, l: [2, 5] },
  { b: true, i: 29, f: 13.5, l: [2, 5, 7] },
  { b: true, i: 29, f: 13.5, l: [2, 5, 7] },
];

const schema1 = {
  f: ["gt", 0],
  f: ["lt", 1000000],
  b: ["eq", true],
  s: ["startsWith", "hello"],
  i: [
    "and",
    [
      ["gt", 10],
      ["lt", 20],
    ],
  ],
  l: ["contains", 7],
};

function match(value, expr) {
  switch (expr[0]) {
    case "eq":
      return value === expr[1];
    case "gt":
      return typeof value === "number" && value > expr[1];
    case "lt":
      return typeof value === "number" && value < expr[1];
    case "startsWith":
      return typeof value === "string" && value.startsWith(expr[1]);
    case "contains":
      return (
        Array.isArray(value) && value.findIndex((x) => x === expr[1]) !== -1
      );
    case "and":
      for (const andExpr of expr[1]) {
        if (!match(value, andExpr)) {
          return false;
        }
      }
      return true;
    default:
      throw new Error("Unknown validator expr " + expr[0]);
  }
}

function validateObject(schema, data) {
  if (typeof data !== "object") {
    return false;
  }
  for (const key in schema) {
    if (!match(data[key], schema[key])) {
      return false;
    }
  }
  return true;
}

function buildMatchClosure(expr) {
  switch (expr[0]) {
    case "eq":
      return (value) => value === expr[1];
    case "gt":
      return (value) => typeof value === "number" && value > expr[1];
    case "lt":
      return (value) => typeof value === "number" && value < expr[1];
    case "startsWith":
      return (value) => typeof value === "string" && value.startsWith(expr[1]);
    case "contains":
      return (value) =>
        Array.isArray(value) && value.findIndex((x) => x === expr[1]) !== -1;
    case "and":
      return (value) => {
        for (const andExpr of expr[1]) {
          if (!match(value, andExpr)) {
            return false;
          }
        }
        return true;
      };
    default:
      throw new Error("Unknown validator expr " + expr[0]);
  }
}

function buildObjMatchClosure(keyval) {
  if (keyval.length < 1) {
    return (value) => true;
  }
  const [key, expr] = keyval.shift();
  const next = buildObjMatchClosure(keyval);
  switch (expr[0]) {
    case "eq":
      return (value) => value[key] === expr[1] && next(value);
    case "gt":
      return (value) => {
        const x = value[key];
        return typeof x === "number" && x > expr[1] && next(value);
      };
    case "lt":
      return (value) => {
        const x = value[key];
        return typeof x === "number" && x < expr[1] && next(value);
      };
    case "startsWith":
      return (value) => {
        const x = value[key];
        return typeof x === "string" && x.startsWith(expr[1]) && next(value);
      };
    case "contains":
      return (value) => {
        const x = value[key];
        return (
          Array.isArray(x) &&
          x.findIndex((x) => x === expr[1]) !== -1 &&
          next(value)
        );
      };
    case "and":
      // TODO: chain individual ands
      return (value) => {
        const x = value[key];
        for (const andExpr of expr[1]) {
          if (!match(x, andExpr)) {
            return false;
          }
        }
        return next(value);
      };
    default:
      throw new Error("Unknown validator expr " + expr[0]);
  }
}

function buildObjectChainValidator(schema) {
  function buildRecursive(pairs, prev) {
    if (pairs.length < 1) {
      return prev;
    } else {
      const [key, expr] = pairs.shift();
      const matcher = buildMatchClosure(expr);
      const f = prev
        ? (value) => prev(value) && matcher(value[key])
        : (value) => matcher(value[key]);
      return buildRecursive(pairs, f);
    }
  }

  const checker = buildRecursive(Object.entries(schema));

  return (value) => {
    if (typeof data !== "object") {
      return false;
    }
    return checker(value);
  };
}

function buildObjectChainValidator2(schema) {
  const f = buildObjMatchClosure(Object.entries(schema));
  return (value) => {
    if (typeof data !== "object") {
      return false;
    }
    return f(value);
  };
}

function buildObjectClosureListValidator(schema) {
  const checkers = Object.entries(schema).map(([key, expr]) => [
    key,
    buildMatchClosure(expr),
  ]);

  return (value) => {
    if (typeof data !== "object") {
      return false;
    }
    for (const [key, f] of checkers) {
      if (!f(value[key])) {
        return false;
      }
    }
    return true;
  };
}

function buildValue(value) {
  switch (typeof value) {
    case "string":
      return '"' + value + '"';
    case "number":
      return value.toString();
    case "boolean":
      return value ? "true" : "false";
    default:
      throw new Error("unhandled type " + typeof value);
  }
}

function buildExpr(expr, ident) {
  switch (expr[0]) {
    case "eq":
      return `( ${ident} === ${buildValue(expr[1])} )`;
    case "gt":
      return `( typeof ${ident} === 'number' && ${ident} > ${buildValue(
        expr[1]
      )} )`;
    case "lt":
      return `(typeof ${ident} === 'number' && ${ident} < ${buildValue(
        expr[1]
      )} )`;
    case "startsWith":
      return `( typeof ${ident} === 'string' && ${ident}.startsWith( ${buildValue(
        expr[1]
      )} ) )`;
    case "contains":
      return `(Array.isArray(${ident}) && ${ident}.findIndex((x) => x === ${buildValue(
        expr[1]
      )}) !== -1)`;
    case "and":
      return `( ${expr[1].map((x) => buildExpr(x, ident)).join(" && ")} )`;
    default:
      throw new Error("Unknown validator expr " + expr[0]);
  }
}

function buildObjectValidator(schema) {
  let code = "let value = null;\n";

  for (const key in schema) {
    const expr = schema[key];
    code += `value = object["${key}"];\n`;
    code += `if (! ${buildExpr(expr, "value")}) { return false }\n`;
  }

  code += "return true;";
  return new Function("object", code);
}

function buildObjectValidatorIndividualConstVars(schema) {
  let index = 0;
  let code = "";
  for (const key in schema) {
    const expr = schema[key];
    const varName = "v" + index;
    code += `const ${varName} = object["${key}"];\n`;
    code += `if (! ${buildExpr(expr, varName)}) { return false }\n`;
    index += 1;
  }

  code += "return true;";
  return new Function("object", code);
}

const EXPECTED_COUNT = 20000000;

function bench(f) {
  const start = Date.now();
  let validCount = 0;
  for (let i = 0; i < 10_000_000; i++) {
    for (const value of data) {
      if (f(value)) {
        validCount += 1;
      }
    }
  }
  const timeMs = Date.now() - start;
  if (validCount !== EXPECTED_COUNT) {
    throw new Error(
      `Invalid count - expected ${EXPECTED_COUNT} got ${validCount}`
    );
  }
  console.log({ validCount, timeMs });
}

function runValidateInterpreted() {
  const f = (value) => validateObject(schema1, value);
  bench(f);
}

function runChained() {
  const validator = buildObjectChainValidator2(schema1);
  bench(validator);
}

function runClosureList() {
  const validator = buildObjectClosureListValidator(schema1);
  bench(validator);
}

function runValidateEvaled() {
  const validator = buildObjectValidator(schema1);
  bench(validator);
}

function runValidateEvaledConstVars() {
  const validator = buildObjectValidatorIndividualConstVars(schema1);
  bench(validator);
}

const cmd = process.argv[2];
switch (cmd) {
  case "interpret":
    runValidateInterpreted();
    break;
  case "jit":
    runValidateEvaled();
    break;
  case "jit-const-vars":
    runValidateEvaledConstVars();
    break;
  case "chained":
    runChained();
    break;
  case "closure-list":
    runClosureList();
    break;
  default:
    throw new Error(`invalid command ${cmd}\nUsage: CMD [interpret | jit]`);
}
