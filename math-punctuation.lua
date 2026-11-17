-- Browsers allow a line break between an inline formula and the punctuation
-- on either side of it, so bind them together: an opening bracket before the
-- formula, and closing punctuation after it.
local NOWRAP = { style = 'white-space: nowrap;' }

local function inline_math(el)
  return el and el.t == 'Math' and el.mathtype == 'InlineMath'
end

function Inlines(inlines)
  local out = pandoc.Inlines {}
  local i = 1
  while i <= #inlines do
    local el, nxt = inlines[i], inlines[i + 1]
    local open = el.t == 'Str' and inline_math(nxt) and el.text:match('[%(%[]+$')
    local math = open and nxt or (inline_math(el) and el) or nil
    if math then
      local after = inlines[i + (open and 2 or 1)]
      local punct = after and after.t == 'Str' and after.text:match('^[%.,;:!%?%)%]]+')
      if open or punct then
        if open then
          local before = el.text:sub(1, #el.text - #open)
          if before ~= '' then out:insert(pandoc.Str(before)) end
        end
        local span = pandoc.Inlines {}
        if open then span:insert(pandoc.Str(open)) end
        span:insert(math)
        if punct then span:insert(pandoc.Str(punct)) end
        out:insert(pandoc.Span(span, NOWRAP))
        if punct then
          local rest = after.text:sub(#punct + 1)
          if rest ~= '' then out:insert(pandoc.Str(rest)) end
        end
        i = i + (open and 2 or 1) + (punct and 1 or 0)
      else
        out:insert(el)
        i = i + 1
      end
    else
      out:insert(el)
      i = i + 1
    end
  end
  return out
end
