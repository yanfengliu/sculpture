# Choice of the sculpture

Status: done (research, read-only)
Owner: worker `research-candidates`
Date: 2026-10-11
Base revision: a3f5055

## What this file decides

Which famous single-figure sculpture the animation will make, judged against five criteria, and why.

The pick is Michelangelo's David. The comparison below was done before the verdict, not after it, and the weak points of the David are listed with the strong ones.

Every claim names its source inline. "Stated" means the source says it; "inferred" means I conclude it from what the sources say.

## The criteria

- (a) A single human figure, among the most famous sculptures in the world.
- (b) Made by one named sculptor by hand, with the making well documented (dates, workshop, tools, sources), so the animation can be authentic.
- (c) The making is tool-driven and visible (carving or modelling), not mostly a foundry or casting process done by others.
- (d) A 3D mesh of the real statue exists under a licence usable here (CC0, CC BY, CC BY-NC-SA all fine). Only availability is noted; worker `research-model` goes deeper.
- (e) Material and dimensions are known.

## Comparison table

Scores: `++` strong, `+` adequate, `-` weak, `--` fails. Heights are of the figure as the holding museum gives them.

| Candidate | (a) fame, single figure | (b) sculptor and documented making | (c) tool-driven, visible | (d) mesh of the real statue | (e) material, size | Verdict |
|---|---|---|---|---|---|---|
| Michelangelo, David, 1501–04 | `++` single nude figure; "the most famous statue in Florence and, perhaps, in all the world" is the museum's own line [S1] | `++` contract 16 Aug 1501, dated payments, start 13 Sep 1501, enclosure, 1502 revision, 1503 showing, 1504 committee, move and unveiling all in documents [S2][S3][S4] | `++` one marble block, carved by Michelangelo alone inside a closed shed; tool marks of punch, claw chisels and drill survive on the statue [S4][S5][S6] | `+` Scan the World model (photogrammetry and structured light), CC BY-SA 4.0 on Commons; Stanford 0.25 mm scan is non-commercial by written licence only [S7][S8] | `++` Carrara marble, 517 cm, 5,560 kg per the museum [S1][S9] | Pick |
| Michelangelo, Moses, c. 1513–15 | `+` famous, single seated figure, but part of a tomb ensemble [S10] | `+` commission 1505 known; the carving itself is thin in documents; a later reworking is commonly stated but not checked here [S10] | `++` marble, carved by Michelangelo [S10] | `-` only a scan of a plaster cast (V&A, Scan the World), licence not shown; no scan of the original found [S11] | `+` marble, 235 cm [S10] | Second |
| Bernini, David, 1623–24 | `+` famous, single figure, less known than Michelangelo's | `+` payments from mid-1623; Baldinucci says seven months; the mirror held by Barberini [S12] | `++` marble, carved by Bernini [S12] | `-` a MyMiniFactory upload exists, origin and licence unclear [S13] | `+` marble, 170 cm, Galleria Borghese [S12] | Third |
| Donatello, bronze David, c. 1440s | `+` famous, single figure | `--` "the creation of the work is undocumented"; date disputed from the 1420s to the 1460s [S14] | `--` bronze: modelled then cast; the visible act is foundry work | `--` Scan the World has only Donatello's marble David [S13] | `+` bronze, 158 cm, Bargello [S14] | Out on (b), (c) |
| Rodin, The Thinker, 1880–1904 | `++` among the most famous | `-` the small clay original is Rodin's; the monumental version was enlarged by assistants and cast by foundries in about 28 casts [S15] | `--` the famous object is a bronze cast of an enlargement | `+` Scan the World scan of the Musée Rodin cast, licence not shown [S16] | `+` bronze, 181–185 cm [S15] | Out on (c) |
| Venus de Milo, c. 150–125 BC | `++` among the most famous | `--` sculptor uncertain (inscription lost); nothing on the making beyond the marks on the stone [S17] | `+` marble, carved, but by whom and how is unknown | `+` Scan the World scan of the Louvre statue, CC BY-SA 4.0 on Commons; SMK cast scan CC0 [S18][S19] | `+` Parian marble, 204 cm [S17] | Out on (b) |
| Augustus of Prima Porta, 1st c. AD | `+` famous, single figure | `--` anonymous; a marble copy of a lost bronze; nothing on the making [S20] | `+` marble, carved | `-` no scan of the Vatican statue found; a cast was scanned by the Digital Sculpture Project, licence unknown [S13] | `+` marble, 208 cm, about 1,000 kg [S20] | Out on (b) |
| Discobolus (Myron; Roman copies) | `+` famous; the famous object is a copy | `--` the original bronze is lost; the marble copies are anonymous Roman work, with restored heads [S21] | `+` marble copies are carved, but by unknown copyists | `+` Scan the World scan of the British Museum copy, licence not shown [S13] | `-` heights of the copies not given by the sources read [S21] | Out on (b) |
| Canova, Perseus, 1800–06 | `+` famous within neoclassicism, less so worldwide | `+` dates and patrons known; Canova's workshop carved from his plaster model by pointing and he finished the surface (standard account, not verified here) | `-` much of the carving was by assistants | `++` the Met released 3D models of about 140 works in 2026 with Perseus among them; the Met record is public domain [S22][S23] | `++` marble, 242.6 × 191.8 × 102.9 cm (Met) [S22] | Out on (c) |
| Giacometti, Walking Man I, 1960 | `+` famous, single figure | `+` modelled by Giacometti, cast in an edition of 10 [S24] | `--` bronze cast | `--` still in copyright (Succession Giacometti, ADAGP, ARS); no free mesh can exist [S25] | `+` bronze, 183 cm [S24] | Out on (c), (d) |

## Notes per candidate

Michelangelo's David: the Opera del Duomo's contract of 16 August 1501 names the block ("nine braccia", "badly blocked out") and the pay of six gold florins a month [S2]. A marginal note dates the first blows to 9 September 1501 (a knot removed from the chest) and the real start to Monday 13 September [S3]. Payments for the wall around the block (14 October 1501) and its roof (20 December 1501) are recorded [S3]. The Operai opened the shed door on 23 June 1503 so all could see the statue [S4]. The committee of 25 January 1504, the four-day move of 14–18 May 1504 and the uncovering on 8 September 1504 are in diaries and deliberations [S4][S26]. The full account is in `david-history.md`.

Michelangelo's Moses: the figure is seated and belongs to the tomb of Julius II in San Pietro in Vincoli; the Wikipedia page cites no contract or letter for the carving itself [S10]. It would be a credible second choice if a scan of the original were open; only a cast scan was found [S11].

Bernini's David: well documented and tool-driven, but it is a life-size figure in a private villa collection and the only mesh found is a user upload of unclear origin [S12][S13]. Its fame is below the top tier.

Donatello's bronze David: the making is undocumented and the date disputed; as a bronze its visible making would be modelling in wax or clay followed by a foundry process, which fails criterion (c) [S14].

Rodin's The Thinker: the object people know is one of about 28 monumental bronzes; Rodin modelled the 72 cm original, the enlargement and casting were done by others [S15]. An animation of "the real tools" would show enlarging machines and a foundry, not Rodin's hands.

Venus de Milo: the Louvre scan exists under CC BY-SA 4.0 [S18], but the sculptor is uncertain and the making is unknown, so every tool and step would be invented [S17].

Augustus of Prima Porta and the Discobolus: anonymous Roman marble work after lost bronzes; there is no record of who carved them or how [S20][S21]. Any animation would be a guess dressed as history.

Canova's Perseus: the best-documented of the neoclassical candidates and the best mesh situation after the Met's 2026 release [S23], but Canova's practice of leaving the roughing and pointing to assistants means the visible making was not one sculptor's hand. The Met record gives dates 1804–6 and public-domain status [S22].

Giacometti's Walking Man I: the work and every photograph of it are controlled by the rights holders [S25]; a free mesh cannot be made, and the object is a cast.

## Verdict

Michelangelo's David wins on every criterion, and on (b) and (c) it wins by a wide margin.

Reason 1: no other candidate has a dated paper trail of the making itself. For the David we have the contract, the day work began, the shed, the fee revision when the figure was "already half made" in February 1502, a public showing in June 1503, the siting committee, the move day by day, and the uncovering [S2][S3][S4][S26]. For the Moses, Bernini's David and Canova's Perseus we have commissions and payments but far less on the work; for the ancient pieces and Donatello we have nothing.

Reason 2: the making was one man with hand tools on one block, and the evidence of those tools is still on the stone. The 2003 study recorded marks of the punch, claw chisels and a small-toothed tool, and no flat chisel [S5]; the Stanford scan shows drill holes along the hairline and chisel cuts by the sideburns [S6]. The bronzes fail this test by nature; Canova's workshop fails it by practice.

Reason 3: material and size are fixed by the museum (517 cm, 5,560 kg, white Carrara marble) [S1][S9], and an open mesh of the real statue exists (CC BY-SA 4.0) with a far finer restricted scan behind it for checking [S7][S8].

The honest weak points of the David: the block's depth and exact shape are not recorded, only inferred (see `david-history.md`); the marble is a middling grade full of small holes, which the animation must show rather than hide; the open mesh is a community scan, not the Stanford one; and the heart-shaped pupils and the state of the top of the head are described in popular sources more than in scholarship.

If the coordinator wanted a bronze-free runner-up, the Moses is the only one close, and it loses on (d) and on how little its carving is documented.

## Sources

- [S1] Galleria dell'Accademia di Firenze, "Michelangelo's David" (official page; height 517 cm, weight 5,560 kg, 16 Aug 1501, 25 Jan 1504, 8 Sep 1504, gilded garland, trunk and sling): https://www.galleriaaccademiafirenze.it/en/artworks/david-michelangelo/
- [S2] Contract of 16 August 1501 as quoted from Milanesi, Le lettere di Michelangelo (1875) pp. 620–23, via Wikipedia "David (Michelangelo)": https://en.wikipedia.org/wiki/David_(Michelangelo)
- [S3] Irving Lavin, "Bozzetti and Modelli" (1967), pp. 97–98 and notes 20–27 (the nodus of 9 September 1501, the wall and roof payments, Frey 1909 docs 12–13): https://publications.ias.edu/sites/default/files/Lavin_BozzettiModelli_1967.pdf
- [S4] Michael Hirst, "Michelangelo in Florence: David in 1503 and Hercules in 1506", Burlington Magazine 142 (2000) pp. 487–492 (Deliberazione of 16 June 1503, "iam semifactum" in February 1502, the move, the Otto di Guardia records): https://www2.gwu.edu/~art/Temporary_SL/129:255/Readings/david.pdf
- [S5] Eric Scigliano, Michelangelo's Mountain (2005/2007) pp. 48–49, 105, as cited in Wikipedia "David (Michelangelo)" (2003 study found marks of subbia, unghietto, gradina, dente di cane, no flat chisel): https://en.wikipedia.org/wiki/David_(Michelangelo)
- [S6] Stanford Digital Michelangelo Project, "The head of Michelangelo's David": https://accademia.stanford.edu/mich/head-of-david/head-of-david.html
- [S7] Wikimedia Commons, File:David (Michelangelo).stl, Scan the World, licence CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:David_(Michelangelo).stl
- [S8] Stanford Digital Michelangelo Project, main page (scan 0.25 mm; data "for scientific use only" under written licence; commercial use needs the Italian authorities): https://accademia.stanford.edu/mich/
- [S9] Stanford Digital Michelangelo Project, "We finish scanning the David" (517 cm, not the 434 cm of the books): https://accademia.stanford.edu/mich/more-david/more-david.html
- [S10] Wikipedia, "Moses (Michelangelo)": https://en.wikipedia.org/wiki/Moses_(Michelangelo)
- [S11] MyMiniFactory, "Moses at the V&A, London" (Scan the World, plaster cast REPRO.1858-278): https://www.myminifactory.com/object/3d-print-moses-at-the-v-a-london-8102
- [S12] Wikipedia, "David (Bernini)" (payments mid-1623; Baldinucci's seven months via Hibbard 1965 p. 54; 170 cm): https://en.wikipedia.org/wiki/David_(Bernini)
- [S13] Mesh availability for the other candidates: MyMiniFactory "David (Bernini)" https://www.myminifactory.com/object/3d-print-david-bernini-80424 ; Scan the World "Discobolus at The British Museum" https://www.myminifactory.com/object/3d-print-7896 ; Digital Sculpture Project credits (Prima Porta cast scan) https://www.digitalsculpture.org/credits.html ; Scan the World FAQ on per-model licences https://www.myminifactory.com/scantheworld/faq/
- [S14] Wikipedia, "David (Donatello, bronze)": https://en.wikipedia.org/wiki/David_(Donatello,_bronze)
- [S15] Wikipedia, "The Thinker": https://en.wikipedia.org/wiki/The_Thinker
- [S16] MyMiniFactory, "The Thinker at the Musée Rodin, France" (Scan the World): https://www.myminifactory.com/object/3d-print-2127
- [S17] Wikipedia, "Venus de Milo": https://en.wikipedia.org/wiki/Venus_de_Milo
- [S18] Wikimedia Commons, File:Scan the World - Venus de Milo.stl, CC BY-SA 4.0: https://commons.wikimedia.org/wiki/File:Scan_the_World_-_Venus_de_Milo.stl
- [S19] SMK Royal Cast Collection, Venus de Milo cast on Sketchfab, CC0: https://skfb.ly/VOvX
- [S20] Wikipedia, "Augustus of Prima Porta": https://en.wikipedia.org/wiki/Augustus_of_Prima_Porta
- [S21] Wikipedia, "Discobolus": https://en.wikipedia.org/wiki/Discobolus
- [S22] The Metropolitan Museum of Art, collection API record 204758, Perseus with the Head of Medusa, 1804–6, marble, 242.6 × 191.8 × 102.9 cm, isPublicDomain true: https://collectionapi.metmuseum.org/public/collection/v1/objects/204758
- [S23] Colossal, "The Met publishes 3D models..." (5 March 2026; nearly 140 models; Perseus among them; licence terms not stated there, check the Met): https://www.thisiscolossal.com/2026/03/metropolitan-museum-of-art-3d-models-art-history/
- [S24] Wikipedia, "L'Homme qui marche I": https://en.wikipedia.org/wiki/L%27Homme_qui_marche_I
- [S25] Art Institute of Chicago, "Walking Man II" (credit line "Succession Giacometti / ARS / ADAGP"): https://www.artic.edu/artworks/23368/walking-man-ii
- [S26] Luca Landucci, A Florentine Diary from 1450 to 1516, transl. Alice de Rosen Jervis (1927), p. 214 (14 May 1504) and the 8 September 1504 entry: https://archive.org/details/ldpd_10273453_000
