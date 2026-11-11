"""Small Markdown <-> HTML converter for card descriptions and documents.

The web app stores rich text as TipTap HTML. Agents read and write Markdown;
this module translates between the two. It covers what TipTap produces:
headings, paragraphs, bullet / numbered / task lists (nested), quotes,
code blocks, rules, tables, bold, italic, strike, inline code and links.
"""
from __future__ import annotations

import html
import re
from html.parser import HTMLParser

PAGE_OPEN = '<div data-type="page" class="document-page">'

# ---------------------------------------------------------------- Markdown -> HTML

_INLINE_CODE = re.compile(r"`([^`]+)`")
_LINK = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_BOLD = re.compile(r"\*\*(.+?)\*\*|__(.+?)__")
_ITALIC = re.compile(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?!\w)")
_STRIKE = re.compile(r"~~(.+?)~~")


def inline(text: str) -> str:
    codes = []

    def keep_code(m):
        codes.append("<code>" + html.escape(m.group(1), quote=False) + "</code>")
        return "\x00" + str(len(codes) - 1) + "\x00"

    text = _INLINE_CODE.sub(keep_code, text)
    text = html.escape(text, quote=False)
    text = _LINK.sub(lambda m: '<a target="_blank" rel="noopener noreferrer nofollow" href="'
                     + html.escape(m.group(2)) + '">' + m.group(1) + "</a>", text)
    text = _BOLD.sub(lambda m: "<strong>" + (m.group(1) or m.group(2)) + "</strong>", text)
    text = _ITALIC.sub(lambda m: "<em>" + (m.group(1) or m.group(2)) + "</em>", text)
    text = _STRIKE.sub(r"<s>\1</s>", text)
    return re.sub("\x00(\\d+)\x00", lambda m: codes[int(m.group(1))], text)


_LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?(.*)$")


def _parse_list(lines, i, indent):
    """Parses list lines starting at i; returns (items, next_index).
    item = {ordered, task, checked, text, children}"""
    items = []
    while i < len(lines):
        m = _LIST_ITEM.match(lines[i])
        if not m:
            break
        ind = len(m.group(1).replace("\t", "    "))
        if ind < indent:
            break
        if ind > indent:
            if items:
                children, i = _parse_list(lines, i, ind)
                items[-1]["children"].extend(children)
                continue
            indent = ind
        task = m.group(3)
        items.append({
            "ordered": m.group(2)[0].isdigit(), "task": bool(task),
            "checked": bool(task and task.strip()[1] in "xX"),
            "text": m.group(4).strip(), "children": [],
        })
        i += 1
        # lazy continuation lines (indented text that is not a list item)
        while i < len(lines) and lines[i].strip() and not _LIST_ITEM.match(lines[i]) \
                and len(lines[i]) - len(lines[i].lstrip()) > indent:
            items[-1]["text"] += " " + lines[i].strip()
            i += 1
    return items, i


def _render_list(items, tasks_as_html: bool):
    out, k = [], 0
    while k < len(items):
        group_task = items[k]["task"] and tasks_as_html
        group_ordered = items[k]["ordered"]
        group = []
        while k < len(items) and (items[k]["task"] and tasks_as_html) == group_task and items[k]["ordered"] == group_ordered:
            group.append(items[k])
            k += 1
        if group_task:
            out.append('<ul data-type="taskList">')
            for it in group:
                out.append('<li data-type="taskItem" data-checked="' + ("true" if it["checked"] else "false") + '"><p>'
                           + inline(it["text"]) + "</p>" + (_render_list(it["children"], tasks_as_html) if it["children"] else "") + "</li>")
            out.append("</ul>")
        else:
            tag = "ol" if group_ordered else "ul"
            out.append("<" + tag + ">")
            for it in group:
                prefix = ("[x] " if it["checked"] else "[ ] ") if it["task"] else ""
                out.append("<li><p>" + inline(prefix + it["text"]) + "</p>"
                           + (_render_list(it["children"], tasks_as_html) if it["children"] else "") + "</li>")
            out.append("</" + tag + ">")
    return "".join(out)


def md_to_html(md: str, *, tasks_as_html=True) -> str:
    lines = (md or "").replace("\r\n", "\n").replace("\r", "\n").split("\n")
    out, i, para = [], 0, []

    def flush():
        if para:
            out.append("<p>" + "<br>".join(inline(x) for x in para) + "</p>")
            para.clear()

    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if not s:
            flush(); i += 1; continue
        if s.startswith("```"):
            flush()
            lang = s[3:].strip()
            code = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith("```"):
                code.append(lines[i]); i += 1
            i += 1
            cls = ' class="language-' + html.escape(lang) + '"' if lang else ""
            out.append("<pre><code" + cls + ">" + html.escape("\n".join(code), quote=False) + "</code></pre>")
            continue
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            flush()
            level = min(len(m.group(1)), 3)
            out.append("<h%d>%s</h%d>" % (level, inline(m.group(2).strip().rstrip("#").strip()), level))
            i += 1; continue
        if re.match(r"^(-{3,}|\*{3,}|_{3,})$", s):
            flush(); out.append("<hr>"); i += 1; continue
        if s.startswith(">"):
            flush()
            quote = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote.append(lines[i].strip()[1:].lstrip()); i += 1
            out.append("<blockquote>" + md_to_html("\n".join(quote), tasks_as_html=tasks_as_html) + "</blockquote>")
            continue
        if s.startswith("|") and i + 1 < len(lines) and re.match(r"^\|?\s*:?-+", lines[i + 1].strip()):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")]); i += 1
            head, body = rows[0], [r for r in rows[2:]]
            t = ["<table><tbody><tr>"] + ["<th><p>" + inline(c) + "</p></th>" for c in head] + ["</tr>"]
            for r in body:
                t += ["<tr>"] + ["<td><p>" + inline(c) + "</p></td>" for c in r] + ["</tr>"]
            t.append("</tbody></table>")
            out.append("".join(t))
            continue
        if _LIST_ITEM.match(line):
            flush()
            m = _LIST_ITEM.match(line)
            items, i = _parse_list(lines, i, len(m.group(1).replace("\t", "    ")))
            out.append(_render_list(items, tasks_as_html))
            continue
        para.append(s)
        i += 1
    flush()
    return "".join(out)


def md_to_document(md: str) -> str:
    """Document HTML: pages are separated by a line holding only '<!-- page -->'."""
    pages = re.split(r"^\s*<!--\s*page\s*-->\s*$", md or "", flags=re.M)
    return "".join(PAGE_OPEN + (md_to_html(p) or "<p></p>") + "</div>" for p in pages)


def split_card_markdown(md: str):
    """Card descriptions: top-level task items ('- [ ] step') become checklist items.
    Returns (description_html, checklist)."""
    lines = (md or "").replace("\r\n", "\n").split("\n")
    keep, checklist, i = [], [], 0
    while i < len(lines):
        m = _LIST_ITEM.match(lines[i])
        if m and m.group(3):
            items, i = _parse_list(lines, i, len(m.group(1)))
            if all(it["task"] for it in items):
                checklist.extend(_to_checklist(items))
                continue
            keep.extend(_unparse(items))
            continue
        keep.append(lines[i])
        i += 1
    return md_to_html("\n".join(keep), tasks_as_html=False), checklist


def _to_checklist(items):
    out = []
    for it in items:
        node = {"text": it["text"], "completed": it["checked"]}
        if it["children"]:
            node["items"] = _to_checklist(it["children"])
        out.append(node)
    return out


def _unparse(items, depth=0):
    out = []
    for it in items:
        mark = ("[x] " if it["checked"] else "[ ] ") if it["task"] else ""
        out.append("  " * depth + ("1. " if it["ordered"] else "- ") + mark + it["text"])
        out.extend(_unparse(it["children"], depth + 1))
    return out


# ---------------------------------------------------------------- HTML -> Markdown

class _ToMd(HTMLParser):
    BLOCK = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "blockquote", "pre", "tr", "div", "ul", "ol", "table", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []          # finished lines
        self.cur = ""          # current inline buffer
        self.lists = []        # stack of [tag, counter, task]
        self.prefix_pending = None
        self.quote = 0
        self.pre = False
        self.href = []
        self.row = None
        self.pages = 0

    # helpers
    def _line_prefix(self):
        return "> " * self.quote

    def _flush(self, blank=False):
        text = self.cur.strip() if not self.pre else self.cur
        if text or self.prefix_pending:
            indent = "  " * max(0, len(self.lists) - 1)
            prefix = self.prefix_pending or ""
            self.out.append(self._line_prefix() + (indent + prefix if prefix else "") + text)
            self.prefix_pending = None
        self.cur = ""
        if blank and self.out and self.out[-1] != "" and not self.lists:
            self.out.append("")

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "div" and a.get("data-type") == "page":
            self._flush(True)
            if self.pages:
                self.out += ["<!-- page -->", ""]
            self.pages += 1
            return
        if tag in ("p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "table", "hr"):
            if not (tag == "p" and self.prefix_pending):
                self._flush(True)
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.cur = "#" * int(tag[1]) + " "
        elif tag == "blockquote":
            self.quote += 1
        elif tag == "pre":
            self.out.append("```")
            self.pre = True
        elif tag == "hr":
            self.out += ["---", ""]
        elif tag in ("ul", "ol"):
            self._flush()
            self.lists.append([tag, 0, a.get("data-type") == "taskList"])
        elif tag == "li":
            self._flush()
            if self.lists:
                lst = self.lists[-1]
                lst[1] += 1
                if a.get("data-type") == "taskItem" or lst[2]:
                    self.prefix_pending = "- [x] " if a.get("data-checked") == "true" else "- [ ] "
                else:
                    self.prefix_pending = (str(lst[1]) + ". ") if lst[0] == "ol" else "- "
        elif tag in ("strong", "b"):
            self.cur += "**"
        elif tag in ("em", "i"):
            self.cur += "*"
        elif tag == "s":
            self.cur += "~~"
        elif tag == "code" and not self.pre:
            self.cur += "`"
        elif tag == "a":
            self.href.append(a.get("href", ""))
            self.cur += "["
        elif tag == "br":
            if self.pre:
                self.cur += "\n"
            else:
                self._flush()
        elif tag == "tr":
            self.row = []
        elif tag in ("td", "th"):
            self.cur = ""
        elif tag == "img":
            self.cur += "![" + a.get("alt", "") + "](" + a.get("src", "")[:200] + ")"
        elif tag == "input" and a.get("type") == "checkbox":
            pass

    def handle_endtag(self, tag):
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6", "p"):
            self._flush(blank=not self.lists and self.row is None)
        elif tag == "blockquote":
            self._flush()
            self.quote = max(0, self.quote - 1)
            self.out.append("")
        elif tag == "pre":
            self.out.extend(self.cur.rstrip("\n").split("\n"))
            self.cur = ""
            self.out += ["```", ""]
            self.pre = False
        elif tag in ("ul", "ol"):
            self._flush()
            if self.lists:
                self.lists.pop()
            if not self.lists:
                self.out.append("")
        elif tag == "li":
            self._flush()
        elif tag in ("strong", "b"):
            self.cur += "**"
        elif tag in ("em", "i"):
            self.cur += "*"
        elif tag == "s":
            self.cur += "~~"
        elif tag == "code" and not self.pre:
            self.cur += "`"
        elif tag == "a":
            self.cur += "](" + (self.href.pop() if self.href else "") + ")"
        elif tag in ("td", "th"):
            if self.row is not None:
                self.row.append(self.cur.strip().replace("|", "\\|"))
            self.cur = ""
        elif tag == "tr":
            if self.row is not None:
                first = not self.out or not self.out[-1].startswith("|")
                self.out.append("| " + " | ".join(self.row) + " |")
                if first:
                    self.out.append("|" + "---|" * len(self.row))
            self.row = None
        elif tag == "table":
            self.out.append("")

    def handle_data(self, data):
        if self.pre:
            self.cur += data
        else:
            self.cur += re.sub(r"\s+", " ", data)


def html_to_md(source: str) -> str:
    if not source:
        return ""
    p = _ToMd()
    p.feed(source)
    p.close()
    p._flush()
    text = "\n".join(p.out)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def html_to_text(source: str, limit: int = 0) -> str:
    text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", source or "")).strip()
    text = html.unescape(text)
    if limit and len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text
