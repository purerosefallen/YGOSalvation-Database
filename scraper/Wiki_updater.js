var scraperjs = require('scraperjs'),
    jsonfile = require('jsonfile'),
    fs = require('fs'),
    async = require('async'),
    //sleep = require('sleep'),
    input_file = require('./updater_input.json'),
    SETCODES = require('./utility/setcode.json'),
    id_update = {},
    bad_page = [],
    json_path = '..\\http\\json\\',
    markers;

async.eachLimit(input_file, 10, function(line, next) {
    var filename = json_path + String(line) + '.json';
    try {
        var card_json = jsonfile.readFileSync(filename),
            wiki_url = card_json.name;
        setTimeout(() => {
            json_create(card_json, wiki_url, filename, next);
        }, 3200);

    } catch (e) {
        console.log('failed', line);
    }
});

function bad_pages() {
    if (bad_page.length) {
        //console.log('Problem pages detected, running with different URL query');
        async.each(bad_page, function(line, next) {
            try {
                var filename = json_path + String(line) + '.json';
                var card_json = jsonfile.readFileSync(filename);
                console.log('Retrying: ' + card_json.name);
                if (card_json.tcg.pack_id != undefined) {
                    wiki_url = card_json.tcg.pack_id;
                } else if (card_json.ocg.pack_id != undefined) {
                    wiki_url = card_json.ocg.pack_id;
                } else {
                    wiki_url = card_json.name + '_(card)';
                }
                json_create(card_json, wiki_url, filename, next);
                bad_page = [];
            } catch (er) {
                console.log('cant read', line);
            }
        });
    }
}

function json_create(card_json, wiki_url, filename, next) {
    scraperjs.StaticScraper.create()
        .request({ url: encodeURI('http://yugioh.wikia.com/wiki/' + wiki_url).replace('#', '').replace('?', '%3F'), encoding: 'utf8', headers: { connection: 'keep-alive' }, agent: false })
        .scrape(function($) {
            console.log('Reading: ' + encodeURI('http://yugioh.wikia.com/wiki/' + wiki_url));
            //console.log('Reading: '+card_json.id + ' ' + card_json.name);
            // Scrape most of the other card information
            try {
                jQuery_data($);
                card_json.tcg = {};
                card_json.ocg = {};
                if (card.tcg_list != undefined) {
                    card.tcg_list = card.tcg_list.trim().split('\n');
                    card_json.tcg.pack = card.tcg_list[2].trim();
                    card_json.tcg.pack_id = card.tcg_list[1].trim();
                    card_json.tcg.date = card.tcg_list[0].trim();
                }
                if (card.ocg_list != undefined) {
                    card.ocg_list = card.ocg_list.trim().split('\n');
                    card_json.ocg.pack = card.ocg_list[2].trim();
                    card_json.ocg.pack_id = card.ocg_list[1].trim();
                    card_json.ocg.date = card.ocg_list[0].trim();
                }
                if (!isNaN(card.Passcode) && card_json.id > 100200000) {
                    old_id = card_json.id;
                    card_json.id = parseInt(card.Passcode);
                    fs.rename(filename, json_path + String(card_json.id) + '.json', function(err) {
                        if (err) { console.log('ERROR: ' + err); }
                    });
                    filename = json_path + String(card_json.id) + '.json';
                    id_update[old_id] = card_json.id;
                    fs.writeFileSync('./utility/id_update.json', JSON.stringify(id_update, null, 4));
                }
                card_json.setcode = card.setcode;
                card_json.name = card.English.trim().replace('Check translation', '');
                if (card_json.type !== 16401 || card.desc.includes('Special Summon')) {
                    card_json.desc = card.desc;
                } else {
                    card_json.desc = 'Special Summoned with the effect of ' + card['Summoned by the effect of'].trim();
                }
                if (card.Types && card.Types.split(' / ')[1] == 'Link') {
                    markers = card['Link Arrows'].replace('Top-Left', '[🡴]').replace('Top-Right', '[🡵]').replace('Bottom-Left', '[🡷]').replace('Bottom-Right', '[🡶]').replace('Top', '[🡱]').replace('Bottom', '[🡳]').replace('Left', '[🡰]').replace('Right', '[🡲]').replace(/\s,\s/g, '').trim();
                    links = [];
                    if (markers.includes('[🡴]')) {
                        links.push(0);
                    }
                    if (markers.includes('[🡱]')) {
                        links.push(1);
                    }
                    if (markers.includes('[🡵]')) {
                        links.push(2);
                    }
                    if (markers.includes('[🡰]')) {
                        links.push(3);
                    }
                    if (markers.includes('[🡲]')) {
                        links.push(4);
                    }
                    if (markers.includes('[🡷]')) {
                        links.push(5);
                    }
                    if (markers.includes('[🡳]')) {
                        links.push(6);
                    }
                    if (markers.includes('[🡶]')) {
                        links.push(7);
                    }
                    card_json.links = links;
                }
                if (markers !== undefined) {
                    card_json.desc = 'Link Arrows: ' + markers + '\n\n' + card_json.desc;
                }
                card_json.picture = card.picture;
                //console.log(card);
                //console.log(card_json);
                fs.writeFileSync(filename, JSON.stringify(card_json, null, 4));
                markers = undefined;
            } catch (error) {
                console.log('\tProblem with ' + card_json.id + ' ' + card_json.name + '\n\t' + error);
                bad_page.push(card_json.id);
                fs.writeFileSync('./utility/bad_page.json', JSON.stringify(bad_page, null, 4));
                bad_pages();
            }
            //sleep.sleep(3);
            next();
        });
}

function jQuery_data($) {
    // General card info
    card = {};
    $('.cardtablerowheader').each(function() {
        return $(this).each(function(index) {
            card[$(this).text()] = $(this).next().text();
        });
    });
    card.desc = $('.navbox-list').eq(0).html().replace(/\<br\>/g, '\n').replace(/<.*?>/g, '').replace(/&apos;/g, '\'').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&#x2019;/g, '\'').replace(/&#x25CF;/g, '●').replace(/\n /g, '\n').trim();
    card.picture = $('.cardtable-cardimage').eq(0).html().match(/<a href=\"(.*?)\/revision/)[1];
    // Setcode operation
    setcode_arr = [];
    $('dt').filter(function() {
        return $(this).text().match(/Archetypes and series(.*)/);
    }).nextUntil('dt').each(function() {
        setcode_arr.push($(this).text().trim());
    });
    setcode_math = [];
    for (var i = 0; i < setcode_arr.length; i++) {
        setcode_math.push(SETCODES[setcode_arr[i]]);
    }
    setcode_math = setcode_math.filter(function(n) {
        return n != undefined;
    });
    card.setcode = '';
    for (var j = 0; j < setcode_math.length; j++) {
        bit = setcode_math[j];
        if (bit.length < 5) {
            bit = bit.replace('0x', '00');
        } else {
            bit = bit.replace('0x', '');
        }
        card.setcode += bit;
    }
    card.setcode = parseInt(card.setcode.toString(16), 16);
    if (isNaN(card.setcode)) {
        card.setcode = 0;
    }

    //TCG Pack data
    card.tcg_list = $('.navbox-list caption').next().next().text().trim().split('\n \n');
    card.tcg_list = card.tcg_list.filter(function(n) {
        return n.match(/\d\d\d\d\-\d\d\-\d\d/);
    });
    card.tcg_list = card.tcg_list.filter(function(n) {
        return !n.match(/[\u3000-\u303F]|[\u3040-\u309F]|[\u30A0-\u30FF]|[\uFF00-\uFFEF]|[\u4E00-\u9FAF]|[\u2605-\u2606]|[\u2190-\u2195]|\u203B/g);
    });
    card.tcg_list = card.tcg_list.filter(function(n) {
        return !n.match(/\-[A-Z][0-9]|\-KR|\-JP|\-TC|\-SP/);
    }).map(function(s) {
        return s.trim();
    }).sort()[0];

    //OCG Pack data
    card.ocg_list = $('.navbox-list caption').next().next().text().trim().split('\n \n');
    card.ocg_list = card.ocg_list.filter(function(n) {
        return n.match(/\d\d\d\d\-\d\d\-\d\d/);
    });
    card.ocg_list = card.ocg_list.filter(function(n) {
        return n.match(/[\u3000-\u303F]|[\u3040-\u309F]|[\u30A0-\u30FF]|[\uFF00-\uFFEF]|[\u4E00-\u9FAF]|[\u2605-\u2606]|[\u2190-\u2195]|\u203B|\-JP/g);
    }).map(function(s) {
        return s.trim();
    }).sort()[0];
    return card;
}