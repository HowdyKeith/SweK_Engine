=====================================================================
  VoxelEngine - distribution & email helper scripts
=====================================================================

This is your dev source tree. Files have their real extensions
(.bat, .ps1, .vbs, .lnk, .js). Develop normally - no rename hassle.

When you want to email someone the project:

  Windows:  double-click MAKE_GMAIL_SAFE.bat
  Mac:      ./make_gmail_safe.sh

That produces ../EngineProject_GmailSafe_<version>.zip with every
Gmail-blocked extension renamed to .X.txt.

When the recipient gets your zip:

  Windows:  rename _SETUP.bat.txt to _SETUP.bat, double-click
  Mac:      chmod +x _SETUP.sh && ./_SETUP.sh

That undoes the renames.

For your portfolio/job-hunt distribution though, GitHub Releases
is the smarter channel:  git tag v688 && gh release create v688
and share the link. No email gymnastics. Anyone evaluating your
code prefers the GitHub repo view to a 5MB email attachment.
