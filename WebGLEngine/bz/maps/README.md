# bz/maps

**No BZFlag map is vendored here.** BZFlag's own worlds (`hix.bzw`, `flagbuffet.bzw`, `fountains.bzw` and the rest)
belong to the BZFlag project and ship under its licence; they are not ours to redistribute inside this tree.

`arena.bzw` in this directory is original, written for the selfcheck and the demo. Everything else you point the
tools at, you supply.

## Getting BZFlag's maps

    git clone --depth 1 -b 2.4 https://github.com/BZFlag-Dev/bzflag
    ls bzflag/misc/maps/*.bzw

## Using them

    node bz/bzw-build.mjs path/to/hix.bzw out.json      # bake one to JSON
    node bz/tools/bzw-coverage.mjs path/to/*.bzw        # what the adapter reads, and what it does not
    node bz/tools/bzw-selfcheck.mjs path/to/misc/maps   # run the selfcheck against the real maps too

The selfcheck's grammar and world tests all run without any of this. The map directory only adds a pass over
BZFlag's own worlds, which is where the interesting numbers are: `hix.bzw` reaches exactly `30*sqrt(2)` past its
own wall, because eight 30x30 boxes are set into the wall at 45 degrees.
