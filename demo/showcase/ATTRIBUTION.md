# Showcase library

The demo library behind the README and website screenshots (`pnpm screenshots`).
Every file already carries its metadata, so importing this folder fills Places,
Tags and People without any manual work:

- **Tags** as a Lightroom-style hierarchy (`Trips|Japan 2023`,
  `Animals|Puffin`, `Space|Artemis II`, `Workflow|Best of`…), plus ratings
  and some titles.
- **Places**: GPS coordinates on every photo taken on Earth.
- **People**: named MWG face regions (`XMP-mwg-rs:RegionInfo`) with matching
  `People|Name` keywords, so faces appear as confirmed people on import.

When changing this folder, keep the metadata complete and only add images
whose license allows redistribution.

## Travel and wildlife photos

From Wikimedia Commons, resized to 2400 px. The camera details are the
original ones, but dates, locations, tags, ratings and titles were rewritten
to build fictional trips for the demo.

| File                          | Author                     | License                                                         | Source                                                                                                                                                                                                                                                                         |
| ----------------------------- | -------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `peru-machu-picchu.jpg`       | Martin St-Amant (S23678)   | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:80_-_Machu_Picchu_-_Juin_2009_-_edit.jpg)                                                                                                                                                                          |
| `peru-llama.jpg`              | Luc Viatour                | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lama_1_Luc_Viatour.jpg)                                                                                                                                                                                            |
| `morocco-chefchaouen.jpg`     | Sergey Pesterev            | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Inhabitants_of_the_blue_city_3.jpg)                                                                                                                                                                                |
| `morocco-ait-benhaddou.jpg`   | Petar Milošević            | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:Ksar_A%C3%AFt_Benhaddou,_Marocco_(%D8%A3%D9%8A%D8%AA_%D8%A8%D9%86_%D8%AD%D8%AF%D9%88%D8%8C_%D8%A7%D9%84%D9%85%D8%BA%D8%B1%D8%A8,_%E2%B4%B0%E2%B5%A2%E2%B5%9C_%E2%B5%83%E2%B4%B0%E2%B4%B7%E2%B4%B7%E2%B5%93).jpg>) |
| `morocco-merzouga-camels.jpg` | Merzougaloisirs            | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Cavalier_de_chameaux_au_passage_dans_une_dune_de_sable_au_Maroc.jpg)                                                                                                                                               |
| `norway-reine.jpg`            | Ximonic (Simo Räsänen)     | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Reine_at_Reinefjorden,_2010_September.jpg)                                                                                                                                                                         |
| `norway-northern-lights.jpg`  | Ximonic (Simo Räsänen)     | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Northern_lights_curtains_and_beams_over_Nordmo_in_Bjerkvik,_Narvik,_Nordland,_Norway,_2023_September_-_3.jpg)                                                                                                      |
| `norway-geirangerfjord.jpg`   | Ximonic (Simo Räsänen)     | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Geirangerfjord_from_%C3%98rnesvingen,_2013_June.jpg)                                                                                                                                                               |
| `japan-snow-monkey.jpg`       | Daisuke tashiro from Japan | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Macaca_fuscata_meditation.jpg)                                                                                                                                                                                     |
| `japan-fushimi-inari.jpg`     | Basile Morin               | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Torii_path_with_lantern_at_Fushimi_Inari_Taisha_Shrine,_Kyoto,_Japan.jpg)                                                                                                                                          |
| `japan-arashiyama-bamboo.jpg` | Basile Morin               | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Bamboo_Grove,_Arashiyama,_Kyoto,_Japan.jpg)                                                                                                                                                                        |
| `japan-kiyomizu-dera.jpg`     | Martin Falbisoner          | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Kiyomizu-dera,_Kyoto,_November_2016_-07.jpg)                                                                                                                                                                       |
| `iceland-skogafoss.jpg`       | Martin Falbisoner          | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Sk%C3%B3gafoss_July_2014.JPG)                                                                                                                                                                                      |
| `iceland-puffin.jpg`          | Boaworm                    | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)       | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Puffin_Latrabjarg_Iceland.jpg)                                                                                                                                                                                     |
| `iceland-jokulsarlon.jpg`     | Kenny Muir                 | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/)       | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Jokulsarlon_lake,_Iceland.jpg)                                                                                                                                                                                     |
| `kenya-giraffes.jpg`          | Byrdyak                    | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Three_giraffes_01.jpg)                                                                                                                                                                                             |
| `kenya-lions.jpg`             | Byrdyak                    | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Family_of_lions_during_the_mating_season.jpg)                                                                                                                                                                      |
| `kenya-zebras.jpg`            | Volodymyr Burdiak          | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Three_zebras_in_Masai_Mara_National_Park,_Kenya.jpg)                                                                                                                                                               |
| `kenya-elephant.jpg`          | Diego Delso                | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) | [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:Elefante_africano_de_sabana_(Loxodonta_africana),_parque_nacional_de_Amboseli,_Kenia,_2024-05-22,_DD_07.jpg>)                                                                                                     |

## NASA photos (public domain)

Downloaded from Wikimedia Commons and resized to 2400 px. NASA imagery is not
subject to copyright in the United States; NASA does not endorse Photokin.

| File                                   | Credit                  | Source                                                                                                                                                              |
| -------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `koch-artemis-portrait.jpg`            | Josh Valcarcel / NASA   | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Jsc2023e0016435_alt.jpg)                                                                                |
| `koch-harmony-module.jpg`              | NASA                    | [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:ISS-59_Christina_Koch_works_inside_the_Harmony_module_(1).jpg>)                                        |
| `koch-destiny-module.jpg`              | NASA                    | [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:ISS-59_Christina_Koch_works_inside_the_Destiny_module_(1).jpg>)                                        |
| `koch-iceland-geology.jpg`             | Robert Markowitz / NASA | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Artemis_II_Crew_geology_training_in_Iceland_-_jsc2024e055108.jpg)                                       |
| `hansen-artemis-portrait.jpg`          | Josh Valcarcel / NASA   | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Jsc2023e0016436_alt2.jpg)                                                                               |
| `hansen-orion-training.jpg`            | Mark Sowa / NASA        | [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:Canadian_Space_Agency_astronaut_and_Artemis_II_mission_specialist_Jeremy_Hansen_(jsc2025e004073).jpg>) |
| `earth-from-orion.jpg`, `earthset.jpg` | NASA (Artemis II)       | [NASA Image and Video Library](https://images.nasa.gov/)                                                                                                            |

## Project demo photos

`full-moon.jpg` is a copy of `demo/images/IMG_8824.jpg`, with its location
removed and its keywords rewritten for the showcase.
