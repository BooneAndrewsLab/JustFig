# Releasing and the Zenodo DOI

The DOI in `CITATION.cff` and `README.md` is a placeholder (`10.5281/zenodo.0000000`) because a
DOI can only be minted by archiving a real release. To get one:

1. Create the GitHub repository (`BooneAndrewsLab/JustFig`, as `src/brand.ts` and
   `CITATION.cff` say) and push `main`.
2. Sign in to https://zenodo.org with GitHub, open **Account → GitHub**, and switch the
   repository **on**. Zenodo then archives every published GitHub Release.
3. If the icon library changed, release `justfig-icons` first (its CLAUDE.md, Releasing), then
   update `icons.lock.json` (version, URL, SHA-256) and `BRAND.iconLibraryPath` here and run
   `npm run icons:fixture`.
4. Bump `version` in `package.json` and `CITATION.cff` (and `date-released`), and the version
   `CLAUDE.md` names (`src/claudeMd.test.ts` checks it); commit, tag `vX.Y.Z`, and publish a
   GitHub Release from the tag. The Release notes say what the release did (they are the
   changelog). Publishing also triggers `deploy.yml` (GitHub Pages); a push to `main` alone
   reaches no user.
5. Zenodo shows two DOIs for the release: the **concept DOI** (all versions) and the version
   DOI. Put the concept DOI in `CITATION.cff` (`doi:`) and `README.md`, and commit.

`justfig-icons` can be archived the same way to get a DOI of its own for the icon library.
