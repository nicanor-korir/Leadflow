import { csvFilename, leadsToCsv } from "../lib/csv";
import { filterLeads } from "../lib/filter";
import type { Lead } from "../lib/types";

let pass = 0;
let fail = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const good = JSON.stringify(actual) === JSON.stringify(expected);
  good ? pass++ : fail++;
  console.log(
    `${good ? "  ok  " : "  FAIL"} ${label}${good ? "" : `\n        expected ${JSON.stringify(expected)}\n        actual   ${JSON.stringify(actual)}`}`
  );
}

function lead(overrides: Partial<Lead>): Lead {
  return {
    id: 1,
    created_at: "2026-08-15T10:00:00.000Z",
    name: "Priya Raman",
    email: "priya@northwind.com",
    company: "Northwind",
    team_size: 200,
    budget: 10000,
    timeline: 3,
    message: "hello",
    score: 99,
    temperature: "hot",
    ai_reason: "Strong fit.",
    status: "captured",
    score_source: "rubric",
    outcome: null,
    ...overrides,
  };
}

// --- header + basic row ---------------------------------------------------
const basic = leadsToCsv([lead({})]);
const lines = basic.replace(/^﻿/, "").trim().split("\r\n");
check("header row present", lines[0].startsWith("id,created_at,name,email"), true);
check("one data row", lines.length, 2);
check("BOM emitted for Excel", basic.charCodeAt(0), 0xfeff);
check("CRLF line endings", basic.includes("\r\n"), true);
check("filename is dated", csvFilename(new Date("2026-08-15T00:00:00Z")), "leadflow-leads-2026-08-15.csv");

// --- RFC 4180 escaping: the part that actually breaks in the wild ---------
const nasty = leadsToCsv([
  lead({ message: 'He said "we waste hours", then left', company: "Acme, Inc." }),
]);
check("quotes are doubled", nasty.includes('"He said ""we waste hours"", then left"'), true);
check("comma field is quoted", nasty.includes('"Acme, Inc."'), true);

const multiline = leadsToCsv([lead({ message: "line one\nline two" })]);
check("newline field is quoted", multiline.includes('"line one\nline two"'), true);
check(
  "row count unaffected by embedded newline",
  multiline.replace(/^﻿/, "").trim().split("\r\n").length,
  2
);

// --- null handling --------------------------------------------------------
const empties = leadsToCsv([lead({ company: null, message: null, outcome: null })]);
check("nulls become empty cells, not the string null", empties.includes("null"), false);

// --- outcome + source round-trip -----------------------------------------
const enriched = leadsToCsv([lead({ outcome: "won", score_source: "gemini" })]);
check("outcome exported", enriched.includes("won"), true);
check("score_source exported", enriched.includes("gemini"), true);

// --- export honours the same filters as the table ------------------------
const set: Lead[] = [
  lead({ id: 1, name: "Hot One", temperature: "hot" }),
  lead({ id: 2, name: "Warm One", temperature: "warm" }),
  lead({ id: 3, name: "Cold One", temperature: "cold", company: "Fernwood" }),
];
check("filter all", filterLeads(set, "", "all").length, 3);
check("filter hot", filterLeads(set, "", "hot").map((l) => l.id), [1]);
check("search matches company", filterLeads(set, "fernwood", "all").map((l) => l.id), [3]);
check("search is case-insensitive", filterLeads(set, "HOT ONE", "all").map((l) => l.id), [1]);
check("search + filter combine", filterLeads(set, "one", "warm").map((l) => l.id), [2]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
