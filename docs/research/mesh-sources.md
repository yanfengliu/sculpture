# Mesh sources for Michelangelo's David

Status: done (research, read-only). Written 2026-10-11 by worker `research-model`. Base revision a3f5055.

Purpose: find the 3D mesh the model pipeline will fetch into an ignored folder and turn into a distance grid. The mesh is never committed (AGENTS.md, Invariants). This note records every candidate, the licence each host states, the download route, and the dead ends, so nobody repeats them.

Method: web search and page fetches only. No mesh, archive or image was downloaded. No account was created and nothing was logged into. Each claim names its source URL. "Stated" means a page says it. "Snippet" means a search-engine excerpt of a page this tool could not open. "Inferred" means my reading, not the page's words.

## Summary

Use the Wikimedia Commons copy of the Scan the World model: `File:David (Michelangelo).stl`, CC BY-SA 4.0, one binary STL of 59,997,484 bytes with a published SHA-1, served from a direct URL that needs no login or token.

Fallback one is the same model at its origin, Scan the World on MyMiniFactory (object 2052), which needs an account or API key to download. Fallback two is a 4-million-face photogrammetry scan of a bronze copy on Sketchfab, CC BY-SA 4.0, which needs a Sketchfab login through its Download API.

The only scan of the marble that is beyond doubt, Stanford's Digital Michelangelo Project, is licence-only for established scholars and may not be put on the Internet, so it is out.

Legal picture in short: the statue is public domain; the scan carries its own CC licence, which we follow; Italy's heritage code lets the Galleria dell'Accademia charge for and forbid commercial reproductions, and a 2023 Florence ruling enforced that against a magazine, but the code states that non-profit study, research and free expression are free. A private, non-commercial repo is on safe ground; a public deployment must stay non-commercial, attributed and respectful, and needs the owner's say-so anyway.

## Candidates

### 1. Wikimedia Commons, File:David (Michelangelo).stl (recommended)

Page: https://commons.wikimedia.org/wiki/File:David_(Michelangelo).stl

Direct file URL (stated on the page and by the API): https://upload.wikimedia.org/wikipedia/commons/4/4d/David_%28Michelangelo%29.stl

Licence (stated): "Creative Commons Attribution-Share Alike 4.0 International", short name "CC BY-SA 4.0", licence URL https://creativecommons.org/licenses/by-sa/4.0 ; `AttributionRequired: true`. The uploader also agreed to the Wikimedia Foundation 3D patent licence.

Author and source (stated): "Scan the World", linked to Commons user `Jonathanbeck`; source "Scan the World @ Myminifactory.com", with the artwork link https://www.myminifactory.com/object/3d-print-michelangelo-s-david-in-florence-italy-2052 and the project link https://www.myminifactory.com/scantheworld/ .

Description (stated, verbatim): "3D printable model of David (Michelangelo), compiled of photogrammetric and structured light scanning". Date of the work in the description: 8 August 2014. Uploaded 2018-02-21T08:58:02Z by `Jonathanbeck`. Commons says "You cannot overwrite this file".

File (stated by the API, https://commons.wikimedia.org/w/api.php?action=query&titles=File:David_(Michelangelo).stl&prop=imageinfo&iiprop=url|size|sha1|mime|timestamp|user|extmetadata&format=json ): size 59,997,484 bytes, MIME `application/sla`, SHA-1 `4d9648fad3882ea2fcb5c17232ef4826b23c045c`.

Triangle count (inferred): a binary STL is 84 + 50·n bytes; 59,997,484 − 84 = 59,997,400 = 50 × 1,199,948 exactly, so this is very likely a binary STL of 1,199,948 triangles. The script must confirm this when it parses the file. Commons states no triangle or vertex count.

Scan or remodel: a scan, by the host's own description. Which object was scanned is not settled; see "Provenance of the Scan the World model" below.

Completeness: not stated by the page. See "Completeness" below.

Scale and up axis: not stated. STL carries no units. See "Scale and up axis" below.

Download route: direct URL, no login, no token. Wikimedia requires a descriptive `User-Agent` header with contact details or it refuses the request (recalled policy, https://meta.wikimedia.org/wiki/User-Agent_policy , not fetched here).

Standing (stated): featured media; Media of the Day on 15 October 2021; used on 60 Commons pages and 12 pages on 11 other wikis; category "STL files from Scan the World".

Is the Commons copy an authorised release? Not stated as such. The uploader is `Jonathanbeck`; the Commons project page says "Scan the World started in June 2014 as a collaborative project between Jonathan Beck and MyMiniFactory" and that in January 2018 "Scan the World began to roll out their data adopting an open license for the majority of their scanned artefacts" ( https://commons.wikimedia.org/wiki/Commons:Scan_the_World ). The upload came one month after that roll-out. Inference: the uploader is the project's founder releasing his project's own file, which is as good as a Commons permission record gets without a VRT ticket, and the page names none.

### 2. Scan the World on MyMiniFactory, object 2052 (origin of candidate 1; fallback one)

Page: https://www.myminifactory.com/object/3d-print-michelangelo-s-david-in-florence-italy-2052 (an older slug, `3d-print-david-by-michelangelo-2052`, also appears in print credits).

Access from this tool: every `myminifactory.com` and `static.myminifactory.com` URL returned HTTP 403, including the object page, the head page, `/api/` and `/api/v2/search`. Inferred: bot protection. Everything below about this page is a search snippet.

Title and date (snippet): "3D Printable David by Scan The World"; published 8 August 2014; the description ties the statue to the Accademia Gallery in Florence and dates it 1501–1504; it gives a height of "14.0 ft".

Licence (snippet): the licence block reads "Credit - Remix - Commercial", and the page says the design may be printed for sale; the page also carries a "MyMiniFactory exclusive" badge. This label is MyMiniFactory's own scheme, not a Creative Commons name. Verify on the live page before relying on it. The Scan the World FAQ (snippet, https://www.myminifactory.com/scantheworld/faq/ ) says some models carry commercial-use restrictions and many are CC0, and tells users to check each model.

Files: not visible in snippets. The Commons copy is the only size and format I can state.

Download route (stated in the API guidelines snippet, https://www.myminifactory.com/pages/api-guidelines ): users must be signed in to download objects inside a third-party app; browsing needs no sign-in; apps must credit the object page and creator; an object's licence carries over into the app. I found no official API reference. A third-party client ( https://github.com/codeofaxel/kiln ) searches and downloads from MyMiniFactory with a free API key held in `KILN_MMF_API_KEY`, which shows a key-based route exists; its endpoint paths were not readable. Recalled and unverified: objects are read at `https://www.myminifactory.com/api/v2/objects/{id}` with a `key` query parameter obtained from the account's developer settings. Treat this as a lead, not a fact.

Related Scan the World pages (snippets): a community story calling the model a free download, https://www.myminifactory.com/stories/david-through-the-ages-donatello-michelangelo-bernini ; the Google Arts & Culture asset that links to this object as the download, https://artsandculture.google.com/asset/david-michelangelo/OQFTUx79zTp0sw ; a Google Arts & Culture story "Michelangelo's David in 3D" credited "by Scan the World and Jonathan Beck", https://artsandculture.google.com/story/michelangelo-39-s-david-in-3d/dAWBjX-EWTtdYA , which states no capture method.

### Provenance of the Scan the World model

The three pages disagree on what was scanned. The MyMiniFactory title says "in Florence, Italy" and the description speaks of the Accademia (snippet). Commons says the model is "compiled of photogrammetric and structured light scanning" (stated). Google Arts & Culture says the model is "a digital scan of a plaster cast of Michelangelo's David from the Statens Museum for Kunst's collection", made with the museum and shared with its permission, while its Details box lists "Location Created: Victoria and Albert Museum, London" (stated, https://artsandculture.google.com/asset/david-michelangelo/OQFTUx79zTp0sw ).

Scan the World's head of David (object 52645, https://www.myminifactory.com/object/3d-print-head-of-michelangelo-s-david-52645 ) is stated in snippets to be an Artec Eva structured-light scan of a plaster cast at SMK (Statens Museum for Kunst, Copenhagen), record KAS2232, published 15 December 2017, with a link to the full-statue download. A re-upload on Sketchfab describes it as "Re-upload of SMK museum data; Artec scan of a cast" ( https://sketchfab.com/3d-models/none-d29af50360624e5e9b1855666475380d ).

Inference: the full-figure model is a composite. The 2014 figure is photogrammetry, most likely of the marble in the Accademia as the title says; the structured-light part is the 2017 SMK cast head. Which surfaces come from which capture is nowhere stated.

Does cast versus marble matter for us? The casts of David descend from moulds taken off the original (recalled; see https://en.wikipedia.org/wiki/Replicas_of_Michelangelo%27s_David , not fetched), so a cast's shape is the real one to within mould and casting tolerance. For a carving animation at browser resolution that difference is below what the distance grid resolves. Inference, not a page's statement. The authenticity rule in `docs/policies/local-rules.md` is met as long as the note records this.

### 3. Sketchfab, "David - Copy" by vimune (fallback two)

Page: https://sketchfab.com/3d-models/david-copy-c9c4d57a03c64233915d06f53b5a31f5 ; API record https://api.sketchfab.com/v3/models/c9c4d57a03c64233915d06f53b5a31f5 (public JSON, read without a token).

Stated: licence "CC Attribution-ShareAlike", slug `by-sa`, http://creativecommons.org/licenses/by-sa/4.0/ ; published 2022-04-30; 2,000,565 vertices, 4,000,144 faces, one texture; downloadable; description "artist: Michelangelo di Lodovico Buonarroti Simoni" and "metal cast copy of the iconic marble statue."; tags include florence, firenze, photogrammetry, realitycapture, blender. Archive sizes from the search API: glb 165,055,572 bytes, gltf 107,298,109, source 161,220,065, usdz 110,563,247.

Inferred: a photogrammetry scan of a bronze copy in Florence, so a cast copy, not the marble. The page does not say which copy. No scale or completeness is stated.

Download route (stated, https://sketchfab.com/developers/download-api ): "Downloading models requires users to be authenticated with a Sketchfab account."; formats "glTF, GLB, and USDZ"; "Models are not currently available in their source formats such as FBX and OBJ through the API."; "If you want your application to download models without end-user authentication, contact us." So this is a login-gated route through OAuth2. glTF is Y-up by specification ( https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html , not fetched).

### 4. Sketchfab and Thingiverse, the Sioux Falls bronze (jerryfisher / jerry7171)

Sketchfab "David by Michelangelo" by jerryfisher: https://sketchfab.com/3d-models/none-8f4827cf36964a17b90bad11f48298ac ; stated CC Attribution; 182,996 vertices, 366,012 faces; glb 13,260,716 bytes, source 32,064,983; description: a partly cleaned-up model of a "full-sized bronze copy" in Sioux Falls. A head-only companion (105 photos of the bronze) is https://sketchfab.com/3d-models/none-3a8f65d7db8e4ba7a0ea886e2b636128 . Full figure, cast copy, lower detail than candidate 3.

Thingiverse thing:502300 "David by Michelangelo" by jerry7171: https://www.thingiverse.com/thing:502300 . The page and its 3dgo.app mirror both returned 403, so its licence is unverified. It is known from a Printables remix ( https://www.printables.com/model/557903-david-by-michelangelo-sculpture-statue-3d-scan , stated: "This is a remix of http://www.thingiverse.com/thing:502300", made solid, smoothed and remeshed, flat base added, updated 20 August 2023, "The user is not the original author of the model") and the same remix on MyMiniFactory as object 59368 by 3DWP ( https://www.myminifactory.com/object/3d-print-david-by-michelangelo-sculpture-statue-3d-scan-59368 ). Inference: jerry7171 and jerryfisher are the same scanner of the Sioux Falls bronze; not verified. A remix is a derivative, so its geometry is less trustworthy than its source.

No Scan the World uploads were found on Thingiverse by search; the query returned only press pieces and MyMiniFactory pages.

### 5. Stanford Digital Michelangelo Project (restricted; out)

Pages: https://graphics.stanford.edu/data/mich/ and https://graphics.stanford.edu/data/dmich-public/ .

Stated: David at 0.25 mm, "nearly a billion polygons" (about 940 million, July 2009), plus earlier 1 mm and 2 mm models and simplified meshes, all PLY; raw range data about 10 billion samples in 2,000 range images (`.sd`); scans carry a warp of about 1 mm per 200 mm.

Stated terms: the contract with the Italian authorities "permits us to distribute these models and range datasets to established scholars, for non-commercial use only"; eligible are published researchers affiliated with a university, industrial lab or similar, and museum scholars; "students may not apply for licenses; their advisor should submit an application on their behalf"; data may be copied "for your own scientific use"; "the data may not be included in the electronic version of a scholarly publication, nor placed on the Internet"; "These restrictions apply to any representations (other than images or video) derived from the data"; physical replicas and class distribution are prohibited; "Any commercial use also requires written permission from the Soprintendenza"; as of April 2021 "Marc Levoy is still the only authorized source of licenses". Requests go to dmich-request@graphics.stanford.edu.

What is open: nothing of the models. `dmich-public` offers tools only (ply2iv, VripPack, the PLY reader) and documentation. ScanView lets unlicensed users view models without extracting data. A view-only iOS app of the laser scan exists ( https://cedmav.sci.utah.edu/visus-gigapixel-david-available-at-itunes-app-store ).

Leaks: a Princeton gallery lists a head-of-David model credited to the project ( https://gfx.cs.princeton.edu/proj/sugcon/models ). It is head-only and sits outside Stanford's stated terms; do not use.

### 6. University of Florence and Hexagon digital twin (not public)

In 2020–21 the University of Florence's engineering department and Hexagon Italy scanned the marble with a Leica Absolute Tracker AT960 and an AICON StereoScan Neo structured-light scanner, over 100,000 scans in more than ten days, to print the Expo 2020 Dubai replica (stated: https://develop3d.com/3d-scanning/david-digital-twin-shows-up-more-than-expected/ ; https://hexagon.com/company/newsroom/press-releases/2021/hexagon-sponsors-italy-expo-2020-dubai-digitalization ; https://www.theflorentine.net/2021/01/05/michelangelo-david-expo-dubai/ ). No page says the data is public. Dead end unless the owner wants to ask the university.

### 7. Dead ends

- threedscans.com (Oliver Laric, since 2012; collections from 14 institutions including the Louvre and the Museo Archeologico Nazionale di Firenze): no David, Moses, Bernini David, Venus de Milo, Thinker or Augustus in the first 50 entries; no licence text on the index or Info page ( https://threedscans.com/ , https://threedscans.com/info/ ).
- Smithsonian open access: about 2,000 CC0 models in OBJ and glTF (stated, 2020, https://www.cgchannel.com/tag/museum ), but no David surfaced in any search; the collection's own search is a script app this tool cannot read.
- Victoria and Albert Museum: its David cast was scanned by Plowman Craven in May 2016 for a film (stated, https://www.vam.ac.uk/blog/caring-for-our-collections/michelangelos-david-part-1-creating-virtual-copies-of-casts ); the V&A's Sketchfab launch covered 23 to 25 objects ( https://www.vam.ac.uk/blog/caring-for-our-collections/adventures-in-3d-scanning-new-models-on-the-va-sketchfab-page ); a Sketchfab search for downloadable "david cast victoria albert museum" returned zero results.
- Galleria dell'Accademia's own site ( https://www.galleriaaccademiafirenze.it/en/artworks/david/ ): fetch failed on a TLS certificate error; no search result shows a 3D model or download offered by the museum.
- GitHub: `alecjacobson/common-3d-test-models` has no David ( https://github.com/alecjacobson/common-3d-test-models ); searches for GitHub-hosted David meshes found none. Any GitHub copy of the Stanford David would breach Stanford's terms; a copy of the Scan the World STL would be legitimate under CC BY-SA with attribution, but the Commons copy is the better-documented one.
- Mirrors of unknown provenance, not fetched: Printables 103686 "David Michelangelo" (David.stl about 53 MB, origin unstated, https://printables.com/model/103686-david-michelangelo/files ); MakerWorld 45486, 2458020 and 1768076 ( https://makerworld.com/en/models/45486-david-by-michelangelo ); Cults3D ( https://cults3d.com/en/3d-model/art/david-by-michelangelo-dernuedge ); Free3D (OBJ, 79,896 polygons, about 2 MB, https://free3d.com/es/modelo-3d/david-statue-by-michelangelo-9733.html ); CGTrader, Remeshy and NMA listings are paid, remodels or AI-made.
- Zenodo/Objaverse records 10235892 (head) and 10352408 (a two-day Blender sculpt): not scans of the full statue ( https://zenodo.org/records/10235892 , https://zenodo.org/records/10352408 ).
- Other Scan the World Davids from casts, not fetched: "David at The State Russian Museum, St Petersburg" ( https://www.myminifactory.com/object/3d-print-24455 ); "Blocky David" is a stylised derivative ( https://www.myminifactory.com/object/3d-print-blocky-david-by-michelangelo-61758 ).
- Sketchfab search for downloadable "michelangelo david" (first 24 by likes, https://api.sketchfab.com/v3/search?type=models&q=michelangelo%20david&downloadable=true&count=24&sort_by=-likeCount ): besides candidates 3 and 4, only heads, eyes, voxel art and artist remodels (Blender and 3ds Max sculpts that say they were not scanned).

## Comparison

| Source | Licence | Format, size | Count | Scan of what | Completeness | Login |
|---|---|---|---|---|---|---|
| Commons File:David (Michelangelo).stl | CC BY-SA 4.0 (stated) | STL, 59,997,484 B (stated) | about 1.2 M triangles (inferred) | Scan the World composite: marble by photogrammetry plus SMK cast by structured light (inferred) | not stated | none |
| MyMiniFactory object 2052 | "Credit - Remix - Commercial" (snippet) | not visible | not visible | same model | not stated | account or API key |
| Sketchfab vimune David - Copy | CC BY-SA 4.0 (stated) | glTF/GLB/USDZ, 107 to 165 MB (stated) | 4,000,144 faces (stated) | bronze copy in Florence (inferred) | not stated | Sketchfab OAuth |
| Sketchfab jerryfisher David by Michelangelo | CC BY (stated) | glTF/GLB, 13 MB (stated) | 366,012 faces (stated) | Sioux Falls bronze copy (stated) | "partly cleaned-up" (stated) | Sketchfab OAuth |
| Thingiverse thing:502300 jerry7171 | unverified (403) | STL (inferred) | unknown | Sioux Falls bronze (inferred) | unknown | none, if it is like other things |
| Stanford Digital Michelangelo | scholars only, no Internet (stated) | PLY | 940 M polygons (stated) | the marble, laser (stated) | small holes (stated) | licence from Marc Levoy |
| Florence/Hexagon twin | not public | unknown | unknown | the marble (stated) | unknown | not available |

## Scale and up axis

No host states units, scale or up axis for any candidate. STL has no unit field. Sketchfab glTF is Y-up by specification but its scale is whatever the uploader exported.

MyMiniFactory's "14.0 ft" (snippet) is about 4.27 m, below the 5.17 m usually quoted for the statue with its base. It may describe the figure without its base or be a print-scale note; treat it as unverified. The statue's documented dimensions belong to the candidates note; the pipeline scales the mesh to that number.

Inferred: Scan the World files are prepared for printing, so the figure most likely stands along +Z in print convention. three.js is Y-up. The pipeline should measure the bounding box, take the longest axis as up, rotate to Y-up, centre the footprint on the origin and scale the height to the documented value. It must log the measured box and the applied transform so a reviewer can check them.

## Completeness

No host states which parts of the figure are covered. The items the carving engine needs checked: the rock base, the sling strap over the left shoulder and down the back, the tree stump behind the right leg, the back, and the top of the head.

What can be said without downloading: the Google Arts & Culture story on the Scan the World model is subtitled "A 360˚ look at the top of one of the world's most famous sculptures" ( https://artsandculture.google.com/story/michelangelo-39-s-david-in-3d/dAWBjX-EWTtdYA ), which suggests the head top is present (inferred). Photogrammetry from floor level usually misses upward-facing surfaces and the gaps between arm and torso; even Stanford's laser model "still contains small holes" (stated). Expect holes and a possibly non-watertight shell.

The pipeline must therefore render the fetched mesh from the fixed capture angles (R16) before building the grid, record which of the five items are present, and close holes in a way it logs, because a distance grid needs a closed surface.

## Legal picture

The statue: Michelangelo died in 1564; the work is in the public domain and "sits outside copyright" (stated in press coverage of the 2023 case, https://news.artnet.com/art-world/florence-gallerie-dellaccademia-wins-david-lawsuit-2313262 ).

The scan: a scan can carry its own licence, and the hosts attach one. Commons states CC BY-SA 4.0 for candidate 1; Sketchfab states CC BY-SA 4.0 for candidate 3. Whether a faithful scan of a public-domain object is itself protected is contested; Sketchfab's own guidance keeps an "editorial" category for models of real-world objects ( https://help.sketchfab.com/en/articles/16152221-choosing-your-model-s-license ). The safe course is to treat the stated licence as binding: credit Scan the World and link the licence, say what was changed, and release any redistributed derivative (a decimated mesh or a distance grid) under the same licence.

Italy's cultural heritage code (Legislative Decree 42/2004, arts. 107–108): a state institution may grant reproduction of the goods it holds (art. 107) and sets a fee (art. 108). Art. 108(3) states "Nessun canone è dovuto per le riproduzioni richieste o eseguite da privati per uso personale o per motivi di studio". Art. 108(3-bis) states "Sono in ogni caso libere le seguenti attività, svolte senza scopo di lucro," for study, research, free expression and the promotion of heritage: reproducing goods "con modalità che non comportino alcun contatto fisico con il bene", without light sources or tripods inside institutions, and sharing lawfully obtained images "in modo da non poter essere ulteriormente riprodotte a scopo di lucro" (text as of 10 May 2026, https://brocardi.it/codice-dei-beni-culturali-e-del-paesaggio/parte-seconda/titolo-ii/capo-i/sezione-ii/art108.html ; the ministry's own copy: https://archiviodistatoprato.cultura.gov.it/fileadmin/user_upload/Codice-BBCC_Articolo-108.pdf ). The free cases were added by decree-law 83/2014 (law 106/2014) and refined by law 124/2017 (per the search summary of the same sources).

Fees and guidelines: ministerial decree 161 of 11 April 2023 set minimum fees for reproductions in state museums, archives and libraries ( https://www.sissco.it/wp-content/uploads/2023/05/DM161A.pdf ); decree 108 of 21 March 2024 widened the exemptions, keeping non-profit, scholarly and open-access uses free while retaining a concession procedure with a "decorum" check ( https://www.finestresullarte.info/attualita/riproduzione-immagini-beni-culturali-cambia-disciplina-aumentano-gratuita ; commentary https://www.rivisteweb.it/doi/10.7390/119180 ). Commentators note a possible clash with EU Directive 2019/1024 on public-sector reuse (same sources).

Case law: the Florence court ruled on 15 May 2023 for the Gallerie dell'Accademia against Edizioni Condé Nast over the July/August 2020 GQ Italia cover that merged a model's face with David's: €20,000 for the unpaid licence fee at the museum's usual rates and €30,000 for non-pecuniary harm from how the image was distorted, on arts. 2 and 9 of the Constitution and the code ( https://itsartlaw.org/2023/08/30/case-review-italian-cultural-heritage-copyright ; https://news.artnet.com/art-world/florence-gallerie-dellaccademia-wins-david-lawsuit-2313262 ; https://hyperallergic.com/florence-museum-wins-copyright-lawsuit-over-image-of-david ). The same review reports a Venice ruling against Ravensburger's Vitruvian Man puzzles with a €1,500 per day penalty. The director says such actions have brought the museum several hundred thousand euros since 2017 (artnet, above). The debate on free expression continues ( https://www.bostonglobe.com/2024/03/28/world/michelangelos-david-statue-dignity-free-expression/ ). Stanford's contract shows the Soprintendenza also asserts control over scan data: distribution to scholars only, commercial use only with its written permission ( https://graphics.stanford.edu/data/mich/ ).

What this means for this repo (inferred from the above; not legal advice):

- A private, non-commercial repo that fetches a lawfully published CC BY-SA scan for study and creative work falls under art. 108(3) and (3-bis): no fee, no concession. The scan's CC licence is the binding instrument; keep the attribution in this note and in the page footer, and keep the mesh out of Git as the repo already requires.
- The Italian cases targeted commercial use of the image (a magazine cover, puzzles). Nothing found targets a non-commercial animation.
- A later public deployment must stay non-commercial: no ads, no paid access, no merchandise; attribution and licence link on the page; nothing that mocks or distorts the figure, since the €30,000 part of the 2023 award turned on how David was depicted. Deployment needs the owner's authorisation regardless (AGENTS.md).
- A commercial deployment would need the Accademia's concession under art. 107 and would bring the Italian fee rules into play, even though the CC licence itself allows commercial use. The code's reach outside Italy is untested; Ravensburger is a German company and was still pursued in an Italian court.
- Only the Stanford data forbids Internet use; we do not touch it.

## Other statues, in case the pick changes

- Moses (Michelangelo, San Pietro in Vincoli, Rome): Scan the World has the V&A's plaster cast, 236.5 cm, object 8102 ( https://www.myminifactory.com/object/3d-print-8102 ); a remix of a Thingiverse scan is object 59365. No open scan of the marble found.
- Bernini's David (Galleria Borghese): one MyMiniFactory community upload, object 80424, 170 cm, not confirmed as Scan the World ( https://www.myminifactory.com/cn/object/3d-print-david-bernini-80424 ); a 2005 Fraunhofer reconstruction was for a virtual museum, not public ( https://archimuse.com/mw2005/papers/bogen/bogen.html ).
- Venus de Milo (Louvre): Scan the World "Torso of Venus de Milo at the Réunion des Musées Nationaux", photogrammetry in PhotoScan, object 15756 ( https://www.myminifactory.com/object/3d-print-15756 ); a Commons STL under CC BY-SA ( https://commons.wikimedia.org/wiki/File:Scan_the_World_-_Venus_de_Milo.stl ). No Louvre-published open 3D found.
- The Thinker (Rodin): Scan the World "The Thinker at the Musée Rodin", object 2127, method not stated ( https://www.myminifactory.com/object/3d-print-2127 ); the Musée Rodin refused a freedom-of-information request for its own scans and the matter went to court ( https://www.theartnewspaper.com/news/rodin-3d , March 2021). Many bronze casts exist, so other scans are likely but unverified.
- Augustus of Prima Porta (Vatican): no Scan the World listing of the statue; a community upload, object 186821, May 2022 ( https://www.myminifactory.com/object/3d-print-186821 ); a 1:10 model on MakerWorld ( https://www.makerworld.com/en/models/17760 ); the Digital Sculpture Project digitised a cast at Erlangen, download not checked ( https://www.digitalsculpture.org/credits.html ).
- Also on Commons under CC BY-SA from Scan the World: the Pietà and the Laocoön ( https://commons.wikimedia.org/wiki/File:Scan_the_World_-_Piet%C3%A0_(Michelangelo).stl , https://commons.wikimedia.org/wiki/File:Scan_the_World_-_Laocoon_Group.stl ).

Inference: none of these has a better-documented open full-body scan than David's Commons STL. The Moses cast and the Venus torso come closest; Bernini's David and the Augustus have only community uploads of unverified provenance.

## Recommendation

Use candidate 1, the Commons STL. It is the only full-figure David with a stated open licence, a stated size and checksum, and a direct URL that needs no login. Its weakness is unsettled provenance (marble or cast, composite) and an unknown hole pattern; both are recorded here and checked by the pipeline.

Fallback one: MyMiniFactory object 2052, the same model at its origin, if the Commons file disappears. It needs an account or API key. The coordinator asks the owner for a MyMiniFactory account token; the script reads it from an environment variable (suggested `MMF_API_KEY`) and never writes it to the repo.

Fallback two: Sketchfab "David - Copy" by vimune, CC BY-SA 4.0, 4 million faces, a bronze copy. It needs a Sketchfab OAuth token through the Download API; the coordinator asks the owner, same handling as above. Its glTF is Y-up and finer than candidate 1, but it is a copy and far larger (107 to 165 MB).

### Fetch steps for the script

1. Query the Commons API: `https://commons.wikimedia.org/w/api.php?action=query&titles=File:David_(Michelangelo).stl&prop=imageinfo&iiprop=url|size|sha1|mime|timestamp|extmetadata&format=json`. Expect `size` 59997484, `sha1` `4d9648fad3882ea2fcb5c17232ef4826b23c045c`, `LicenseShortName` `CC BY-SA 4.0`. Stop with a clear message if any of the three differ: the file was replaced and the licence must be re-read.
2. GET `https://upload.wikimedia.org/wikipedia/commons/4/4d/David_%28Michelangelo%29.stl` with a `User-Agent` such as `sculpture-model-pipeline/0.1 (https://github.com/<owner>/sculpture; <contact email>)`. No token, no cookie. Expect 59,997,484 bytes. Save to an ignored path, for example `assets/cache/david/David_(Michelangelo).stl` (AGENTS.md lists `assets/cache/` as ignored).
3. Verify SHA-1 against the value above; delete the file and fail if it differs.
4. Write `assets/cache/david/SOURCE.json` beside it with the URL, size, SHA-1, fetch time, licence `CC BY-SA 4.0`, licence URL, and the attribution string: `Scan the World (Jonathan Beck) @ MyMiniFactory.com, "David (Michelangelo).stl", via Wikimedia Commons, CC BY-SA 4.0; modified (scaled, rotated, hole-filled) for the sculpture repo`.
5. Parse the STL. If the header is 84 bytes and the file is 84 + 50·n bytes, it is binary with n = 1,199,948 triangles; otherwise parse as ASCII. Log n, the bounding box and the axis of greatest extent.
6. Normalise: rotate so the longest axis is +Y, centre the footprint, scale the height to the documented value from the candidates note, log the transform. Render from the fixed capture angles and record which of base, sling, stump, back and head top are present. Close holes and log the method. Then build the distance grid.
7. Put the attribution and the licence link on the page and in `docs/research/` (this note).

Expected transfer: one 60 MB GET; Wikimedia asks for a descriptive User-Agent and modest concurrency, nothing more.

## Lookups made (for the record)

Fetched and read: Commons file page and API record; Commons:Scan the World; Stanford `data/mich` and `data/dmich-public`; threedscans.com index and Info; Sketchfab Download API page; Sketchfab search API (three queries) and the vimune model record; Google Arts & Culture asset and story; `common-3d-test-models` README; Kiln README and GitHub tree; brocardi.it art. 108; Center for Art Law case review.

Fetched and refused: myminifactory.com object 2052 (two slugs), head 52645, `/api/`, `/api/v2/search`; static.myminifactory.com object 2052; thingiverse.com thing:502300; 3dgo.app mirror of thing:502300 (all HTTP 403); web.archive.org (blocked for this tool); galleriaaccademiafirenze.it (TLS certificate error).

Searched (about fifteen queries): Scan the World David on MyMiniFactory and Thingiverse; Sketchfab CC Davids; Commons STL; MyMiniFactory API; jerry7171; Accademia and Hexagon digital twin; GitHub meshes; SMK cast; Smithsonian, V&A and museum open access; MyMiniFactory licence snippet; GQ ruling; art. 108 and the 2023–2024 decrees; Moses and Bernini; Venus de Milo, Thinker and Augustus.
