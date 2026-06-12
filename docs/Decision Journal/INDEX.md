# Decision Journal — Neural Net Activity Dashboard
> Every decision Mythos makes is logged here. Each entry captures which files were read,
> what path was taken, and whether the outcome was successful. This data powers the
> neural visualization and feeds back into boot sequence for pattern learning.

---

## Recent Decisions (Last 7 Days)

```dataview
TABLE
  time AS "Time",
  query AS "Task",
  outcome AS "Result",
  confidence AS "Conf",
  duration_minutes AS "Min"
FROM "Neural Net/Decision Journal"
WHERE type = "decision" AND date >= date(today) - dur(7 days)
SORT date DESC, time DESC
LIMIT 25
```

## Files Most Frequently Read

```dataview
TABLE length(rows) AS "Times Read"
FROM "Neural Net/Decision Journal"
WHERE type = "decision"
FLATTEN files_read AS file_accessed
GROUP BY file_accessed
SORT length(rows) DESC
LIMIT 15
```

## High Confidence Decisions (>0.9)

```dataview
TABLE
  date AS "Date",
  query AS "Task",
  confidence AS "Conf",
  outcome AS "Outcome"
FROM "Neural Net/Decision Journal"
WHERE type = "decision" AND confidence >= 0.9
SORT confidence DESC
LIMIT 15
```

## Failed / Partial Decisions (Learning Feed)

```dataview
TABLE
  date AS "Date",
  query AS "Task",
  confidence AS "Conf",
  outcome_notes AS "What Happened",
  decision_path AS "Path Taken"
FROM "Neural Net/Decision Journal"
WHERE type = "decision" AND (outcome = "failed" OR outcome = "partial")
SORT date DESC
```

## Decisions Per Session

```dataview
TABLE length(rows) AS "Decisions", 
  min(rows.confidence) AS "Min Conf",
  round(sum(rows.duration_minutes)) AS "Total Min"
FROM "Neural Net/Decision Journal"
WHERE type = "decision"
GROUP BY session
SORT session DESC
```

## Most Modified Files

```dataview
TABLE length(rows) AS "Times Modified"
FROM "Neural Net/Decision Journal"
WHERE type = "decision"
FLATTEN files_modified AS file_changed
GROUP BY file_changed
SORT length(rows) DESC
LIMIT 10
```

---

*Related: [[Neural Net/Claude Memory/INDEX]] · [[Neural Net/Session_Logs/INDEX]] · [[Neural Net/Claude Memory/System Rules]]*
