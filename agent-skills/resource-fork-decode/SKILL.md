---
name: resource-fork-decode
description: Reverse-engineer the binary layout of a classic Mac resource type (Escape Velocity / EV Nova plug-ins and similar 68k/PowerPC resource-fork formats) from hex dumps, by diffing multiple real samples to isolate which byte offsets hold which fields, then pinning each field against a known in-game value. Use when decoding an unknown resource type (mïsn, oütf, shïp, dësc, snd, spöb, etc.), figuring out where a specific field (cost, mass, id, flags) lives in a resource, or building a parser/encoder for a proprietary Mac binary format from example dumps.
---

# resource-fork-decode

A repeatable method for pinning the byte layout of a classic Mac resource type from
real sample dumps, instead of guessing offsets. It's the approach that decoded EV
Nova's mïsn / oütf / dësc / snd formats field-by-field, verified against actual
in-game values.

The core idea: **you cannot read a field's offset from a single sample — you diff
several.** A field that varies across samples reveals its offset by being the thing
that changes; a field that's constant is a template/sentinel. Then you *pin* the
offset by matching its value to something you know from the running program.

## When to use
- Decoding an unknown resource type from hex dumps (EV/EV Nova plug-ins, HyperCard,
  or any 68k/PPC resource-fork data).
- Locating a specific field (cost, mass, id, a linked resource id, flags) in a
  resource whose overall structure you partly know.
- Building a parser AND a matching encoder for a proprietary Mac binary format.

## Method

**1. Get several real samples of the SAME resource type.**
Ideally samples that differ in known ways (e.g. three cargo missions with different
destinations, or two outfits with different prices). One sample is never enough to
locate a field.

**2. Reconstruct raw bytes from the hex dump.**
Dumps look like `000000  01 02 03 ...  |ascii|`. Extract the hex with
`scripts/hexdump_to_bin.py dump.txt out.bin` (regex-based; ignores the offset column
and the ASCII gutter).

**3. Diff the samples at every offset.**
`scripts/diff_fields.py a.bin b.bin c.bin` prints, for each 16-bit offset, the value
in each sample and flags where they DIFFER vs. stay CONSTANT. Big-endian is the
default for Mac resources. Interpretation:
  - **Differs across samples** -> a per-record field (id, destination, quantity...).
  - **Constant and meaningful** -> a template value or type tag.
  - **0xFFFF / -1** -> almost always the "none / not set / not for sale" sentinel.
    Do NOT report it as a number; treat it as "unset."

**4. Pin each field against a known value.**
This is the step that turns "an offset that varies" into "the Cost field." Take a
value you KNOW from the running program (the in-game price, the mass shown in the
UI, a name string you can read) and find the offset whose value equals it. One known
number pins one field for good. If you have two samples with two known, *different*
values, the field is the offset that differs by exactly that delta.

**5. Watch for text vs. numeric fields and encodings.**
Mac text is MacRoman, often with a length prefix or a NUL terminator; `\r` (0x0D) is
the line break, not `\n`. C-strings sit at fixed offsets in some formats. Names and
descriptions are frequently *linked by id* (e.g. description id = resource id +
constant) rather than stored inline.

**6. Verify with a round-trip.**
Once you have a parser, write the matching encoder and confirm parse -> encode ->
parse reproduces every field (and, ideally, the original bytes). A byte-faithful
round-trip is the proof the layout is right. Never claim a field is pinned on a
single ambiguous sample — say "unverified" until a known value confirms it.

## Guidelines
- **Honesty over guessing.** If two samples don't disambiguate a field, say so and
  ask for one known value rather than inventing an offset. A wrong pinned field is
  worse than an honest "unknown."
- **Sentinels first.** 0xFFFF (-1) and 0x0000 are usually "none," not data. Rule
  them out before treating an offset as a real value.
- **Diff, don't assume.** Even when a public format reference exists, confirm each
  offset against the actual samples — TCs and variants deviate from the spec.
- The scripts are helpers; the judgment (which known value pins which field) is the
  real work.
