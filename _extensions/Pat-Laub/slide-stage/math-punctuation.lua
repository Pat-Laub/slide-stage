-- Browsers allow a line break between an inline formula and the punctuation
-- on either side of it, so bind them together: opening brackets and quotes
-- before the formula, closing punctuation after it.
local NOWRAP = { style = 'white-space: nowrap;' }
local OPEN = { '(', '[', '\u{201C}', '\u{2018}' }
local CLOSE = { '.', ',', ';', ':', '!', '?', ')', ']', '\u{201D}', '\u{2019}' }
local QUOTES = {
  DoubleQuote = { '\u{201C}', '\u{201D}' },
  SingleQuote = { '\u{2018}', '\u{2019}' }
}

local function inline_math(el)
  return el and el.t == 'Math' and el.mathtype == 'InlineMath'
end

-- Longest run of `marks` at the end (or start) of s, matched whole characters.
local function run(s, marks, at_end)
  local n = 0
  repeat
    local found = false
    for _, m in ipairs(marks) do
      if at_end and s:sub(-n - #m, -n - 1) == m
          or not at_end and s:sub(n + 1, n + #m) == m then
        n, found = n + #m, true
        break
      end
    end
  until not found or n >= #s
  return n
end

-- Smart quotes around a formula become literal marks, so they can be bound.
local function Quoted(el)
  local c = el.content
  if inline_math(c[1]) or inline_math(c[#c]) then
    local q = QUOTES[el.quotetype]
    local out = pandoc.Inlines { pandoc.Str(q[1]) }
    out:extend(c)
    out:insert(pandoc.Str(q[2]))
    return out
  end
end

local function merge_strs(inlines)
  local out = pandoc.Inlines {}
  for _, el in ipairs(inlines) do
    local last = out[#out]
    if el.t == 'Str' and last and last.t == 'Str' then
      out[#out] = pandoc.Str(last.text .. el.text)
    else
      out:insert(el)
    end
  end
  return out
end

local function Inlines(inlines)
  inlines = merge_strs(inlines)
  local out = pandoc.Inlines {}
  local i = 1
  while i <= #inlines do
    local el, nxt = inlines[i], inlines[i + 1]
    local n_open = (el.t == 'Str' and inline_math(nxt)) and run(el.text, OPEN, true) or 0
    local math = n_open > 0 and nxt or (inline_math(el) and el) or nil
    local after = math and inlines[i + (n_open > 0 and 2 or 1)]
    local n_close = (after and after.t == 'Str') and run(after.text, CLOSE, false) or 0
    if math and (n_open > 0 or n_close > 0) then
      local span = pandoc.Inlines {}
      if n_open > 0 then
        local before = el.text:sub(1, -n_open - 1)
        if before ~= '' then out:insert(pandoc.Str(before)) end
        span:insert(pandoc.Str(el.text:sub(-n_open)))
      end
      span:insert(math)
      if n_close > 0 then span:insert(pandoc.Str(after.text:sub(1, n_close))) end
      out:insert(pandoc.Span(span, NOWRAP))
      if n_close > 0 then
        local rest = after.text:sub(n_close + 1)
        if rest ~= '' then out:insert(pandoc.Str(rest)) end
      end
      i = i + (n_open > 0 and 2 or 1) + (n_close > 0 and 1 or 0)
    else
      out:insert(el)
      i = i + 1
    end
  end
  return out
end

return {
  { Quoted = Quoted },
  { Inlines = Inlines }
}
