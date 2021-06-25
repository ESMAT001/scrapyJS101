const got = require('got')
const fs = require("fs")
const readLine = require('readline')
const { JSDOM } = require("jsdom");




const scrapyJS = function (baseURL = {}, firstPage = 1, lastPage = 1, options = {}) {
    let threads = 0
    const maxThreads = options.maxThreads || 8
    const retryLimit = options.retryLimit || 4
    const timeOutLimit = options.timeOutLimit * 1000 || 20 * 1000
    const englishLangRegx = /[a-zA-Z 0-9]/g

    const getPage = (function* nextPage() {
        let index = firstPage;
        while (index <= lastPage) {
            yield index++
        }
    })()

    let extractDownloadLinks = function (nodes, url) {
        try {
            function recursiveDlLinkExractor(el) {


                for (let index = 0; index < el.children.length; index++) {
                    if (el.children[index].nodeName === "A") {
                        return el.children[index].href
                    } else {
                        const link = recursiveDlLinkExractor(el.children[index])
                        if (link) return link;
                    }
                }

                return;
            }

            function extractLinks(chunk) {
                const downloadIdentifier = /با کیفیت/
                const dlLinks = []
                for (let i = 0; i < chunk.length; i++) {
                    if (downloadIdentifier.test(chunk[i].textContent)) {
                        const quality = chunk[i].textContent.match(englishLangRegx).join("").trim()
                        dlLinks.push({
                            quality,
                            downloadLinks: recursiveDlLinkExractor(chunk[i + 1])
                        })
                    }
                }
                return dlLinks;
            }


            let startIndex = null
            let endIndex = null
            for (let index = 0; index < nodes.length; index++) {
                if (nodes[index].nodeName === "H3" && startIndex === null) {
                    startIndex = ++index
                } else if (nodes[index].nodeName === "HR" && endIndex === null) {
                    endIndex = index
                }
            }

            let links = Array.from(nodes).slice(startIndex, endIndex)
            const indexes = []
            const persianSubtitle = /زیرنویس چسبیده فارسی/
            const dualLang = /نسخه دوبله فارسی/
            let subLang = undefined
            for (let index = 0; index < links.length; index++) {
                if (links[index].nodeName === "DIV") {

                    indexes.push(index)
                    if (persianSubtitle.test(links[index].textContent)) {
                        subLang = "persian_sub"
                    } else if (dualLang.test(links[index].textContent)) {
                        subLang = "dual_lang"
                    }
                }
            }


            let downloadLinks = {}
            if (dualLang.test(links[0].textContent) && indexes.length < 3) {
                downloadLinks.persian_lang = extractLinks(links)
            } else if (!subLang) {
                downloadLinks.original_lang = extractLinks(links)
            } else {
                downloadLinks = {
                    [subLang]: extractLinks(links.slice(indexes[0], indexes[1])),
                    original_lang: extractLinks(links.slice(indexes[1], indexes[2])),
                }
            }

            return downloadLinks;

        } catch (error) {
            fs.appendFileSync('./error.txt', url + "\n", function (err) {
                if (err) throw err;
            })
            return "error"
        }

    }

    const callbacks = {}

    function on(type, callback) {
        switch (type) {
            case "finished":
                callbacks.onFinished = callback;
                break;
            case "crawled":
                callbacks.onCrawled = callback;
                break;
            case 'error':
                callbacks.onError = callback;
            default:
                break;
        }
    }

    function override(fnName, fn) {
        switch (fnName) {
            case 'extractDownloadLinks':
                extractDownloadLinks = fn
                break;

            default:
                break;
        }
    }


    async function crawlSinglePage(
        url,
        shouldReturn = false,
        {
            nameSelector = options.nameSelector,
            downloadLinkSelector = options.downloadLinkSelector
        } = {}
    ) {
        try {

            var html = await got(url, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
            const dom = new JSDOM(html.body)
            const movieName = dom.window.document.querySelector(nameSelector).textContent.match(englishLangRegx).join("").trim()
            const nodes = dom.window.document.querySelectorAll(downloadLinkSelector)

            const downloadLinks = extractDownloadLinks(nodes, url)

            if (downloadLinks.length === 0) {
                fs.appendFileSync('./noMedia.txt', movieName + "\n", function (err) {
                    if (err) throw err;
                })
            }

            const result = {
                movie_name: movieName,
                download_links: downloadLinks
            }

            if (shouldReturn) {
                return result
            } else {
                return callbacks.onCrawled(result)
            }

        } catch (error) {
            return callbacks.onError({
                error: error,
                url
            })

        }

    }



    async function* scrapeMainPage(url) {

        try {
            var html = await got(url, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
        } catch (error) {
            return callbacks.onError({
                error,
                url
            })
        }
        const dom = new JSDOM(html.body);
        const links = dom.window.document.querySelectorAll(options.mainPageLinkSelector)


        for (let index = 0; index < links.length; index++) {
            yield links[index].href
        }
    }


    async function crawl() {
        console.log('crawling started')
        let page = getPage.next()
        const regx = /سریال/
        const regx2 = /[a-zA-Z]/g
        while (!page.done) {
            const url = baseURL + "/page/" + page.value + "/"
            // console.log('threads', threads, url)


            const mainPageScrapper = scrapeMainPage(url)
            let link = await mainPageScrapper.next()
            while (!link.done) {

                if (!regx.test(decodeURI(link.value)) && regx2.test(decodeURI(link.value))) {

                    if (threads < maxThreads) {
                        threads++
                        console.log('adding thread')
                        crawlSinglePage(link.value)
                    } else {
                        threads--
                        console.log('removing thread')
                        await crawlSinglePage(link.value)
                    }

                } else {
                    // console.log('skipped ', decodeURI(link.value))
                }
                link = await mainPageScrapper.next()
            }

            fs.appendFileSync('./page.txt', page.value.toString() + "\n", function (err) {
                if (err) throw err;
            })

            page = getPage.next()

        }

        return callbacks.onFinished() ? callbacks.onFinished !== undefined : undefined
    }


    async function searchFirstSite(name, shouldReturn = false) {
        const url = 'https://www.film2movie.asia/search/' + encodeURI(name)
        try {
            var html = await got(url, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
        } catch (error) {
            return callbacks.onError({
                error,
                url
            })
        }
        const dom = new JSDOM(html.body);
        let links = dom.window.document.querySelectorAll(options.mainPageLinkSelector)
        if (links.length === 0) {
            const notFoundRegx = /مورد درخواستی در این سایت وجود ندارد/
            links = dom.window.document.querySelectorAll(options.notFoundSelector)
            if (notFoundRegx.test(links[0].textContent)) {
                fs.appendFileSync('./notFound.txt', name+"\n")
            }
        } else {
            const movieNameRegx = new RegExp(name, 'i')
            for (let index = 0; index < links.length; index++) {
                if (movieNameRegx.test(decodeURI(links[index].href).replaceAll("-", ' '))) {
                    console.log('found', decodeURI(links[index].href))
                    return await crawlSinglePage(links[index].href, shouldReturn)
                }
            }
        }



    }


    function extractDownloadLinksForSecondSite(nodes, url) {

        nodes = Array.from(nodes)
        let condition = false;

        nodes.forEach(element => {
            if (new RegExp('آموزش سوئیچ بین صدای فارسی و انگلیسی').test(element.textContent)) {
                condition = "dual"
                return;
            } else if (
                new RegExp('نسخه دوبله فارسی سانسور شده').test(element.textContent)
                ||
                new RegExp('نسخه سانسور شده با دوبله فارسی').test(element.textContent)
            ) {
                let found = false;
                for (let index = 0; index < nodes.length; index++) {
                    if (new RegExp("نسخه سانسور شده با زیرنویس فارسی چسبیده").test(nodes[index].textContent)) {
                        found = true;
                    }
                }
                if (found) {
                    condition = 'per&original_lang'
                } else {
                    condition = 'persian_lang'
                }
            } else if (new RegExp('نسخه سانسور شده با زیرنویس فارسی چسبیده').test(element.textContent)) {
                condition = 'persian_sub'
            }
        });



        if (condition === "dual") {
            const dlLinks = []
            for (let index = 0; index < nodes.length; index++) {
                if (nodes[index].textContent === '~~~~~~~~~~~~~~' && nodes[index + 2].childElementCount) {
                    dlLinks.push({
                        quality: nodes[index + 1].textContent.match(englishLangRegx).join("").trim(),
                        downloadLinks: nodes[index + 2].children[1].children[0].href
                    })
                }
            }
            return {
                original_lang: dlLinks
            }
        } else if (condition === "per&original_lang") {
            let persian_lang = []
            let original_lang = []
            let insertTo;
            for (let index = 0; index < nodes.length; index++) {
                if (
                    new RegExp('نسخه دوبله فارسی سانسور شده').test(nodes[index].textContent)
                    ||
                    new RegExp('نسخه سانسور شده با دوبله فارسی').test(nodes[index].textContent)
                ) {
                    insertTo = 'persian_lang'
                } else if (new RegExp("نسخه سانسور شده با زیرنویس فارسی چسبیده").test(nodes[index].textContent)) {
                    insertTo = 'original_lang'
                }

                if (nodes[index].textContent === '~~~~~~~~~~~~~~') {
                    if (insertTo === 'persian_lang') {
                        persian_lang.push({
                            quality: nodes[index + 1].textContent.match(englishLangRegx).join("").trim(),
                            downloadLinks: nodes[index + 2].children[1].children[0].href
                        })
                    } else {
                        original_lang.push({
                            quality: nodes[index + 1].textContent.match(englishLangRegx).join("").trim(),
                            downloadLinks: nodes[index + 2].children[1].children[0].href
                        })
                    }

                }
            }

            const result = {
                persian_lang,
                original_lang
            }


            return result;


        } else if (condition === "persian_lang") {
            const dlLinks = []
            for (let index = 0; index < nodes.length; index++) {
                if (nodes[index].textContent === '~~~~~~~~~~~~~~') {
                    dlLinks.push({
                        quality: nodes[index + 1].textContent.match(englishLangRegx).join("").trim(),
                        downloadLinks: nodes[index + 2].children[1].children[0].href
                    })
                } else if (nodes[index].textContent === '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~') {
                    break;
                }
            }
            return {
                persian_lang: dlLinks
            }
        } else if (condition === 'persian_sub') {
            const dlLinks = []
            for (let index = 0; index < nodes.length; index++) {
                if (nodes[index].textContent === '~~~~~~~~~~~~~~') {
                    dlLinks.push({
                        quality: nodes[index + 1].textContent.match(englishLangRegx).join("").trim(),
                        downloadLinks: nodes[index + 2].children[1].children[0].href
                    })
                } else if (nodes[index].textContent === '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~') {
                    break;
                }
            }
            return {
                persian_sub: dlLinks
            }
        }

    }


    async function searchSecondSite(name, shouldReturn = false) {
        const originl_name = name
        const url = "https://www.film2serial.ir/?s="
        const regx = /[():'`]/g
        name = name.split("")
        for (let index = 0; index < name.length; index++) {
            if (regx.test(name[index])) {
                switch (name[index]) {
                    case "'":
                        name[index] = "%27"
                        break;
                    case "(":
                        name[index] = "%28"
                        break;
                    case ")":
                        name[index] = "%29"
                        break;
                    default:
                        name[index] = encodeURIComponent(name[index])
                        break;
                }
            }
        }
        name = name.join("").replaceAll(" ", "+")

        try {
            var html = await got(url + name, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
        } catch (error) {
            return callbacks.onError({
                error,
                url
            })
        }
        const document = new JSDOM(html.body).window.document;

        const links = document.querySelectorAll("div.post > div.title > h3 > a")


        let data = null;

        for (let index = 0; index < links.length; index++) {
            if (
                new RegExp(originl_name, 'i').test(links[index].textContent)
                &&
                new RegExp("دانلود", 'i').test(links[index].textContent)
            ) {
                console.log('found', links[index].href)

                const oldFn = extractDownloadLinks
                override('extractDownloadLinks', extractDownloadLinksForSecondSite)
                data = await crawlSinglePage(links[index].href, true,
                    {
                        nameSelector: "div.post > div.title",
                        downloadLinkSelector: "div.contents > *"
                    }
                )
                override('extractDownloadLinks', oldFn)
                return data
            }
        }

        // if (links.length === 0) return console.log('not found');


        // console.log(dom.window.document.querySelector("title").textContent)



    }

    async function search(name, db = false) {
        console.log(name)
        name = name.split(" ")
        const pageNumber = name.shift()
        const id = name.shift()
        const movieDate = name.pop()

        let temp = name.join(" ").replaceAll(/[.*']/g, '').replaceAll(/[-]/g, " ").replaceAll(/[&]/g, 'and')
        name = name.join(" ").replaceAll(/[.()*']/g, '').replaceAll(/[-]/g, " ").replaceAll(/[&]/g, 'and')

        if (db) {
            let dbData
            let tempName = name
            if (tempName.indexOf(":") !== -1) { tempName = tempName.slice(0, tempName.indexOf(":")) }

            const lineRegx = new RegExp(tempName, 'i')
            const dateRegx = new RegExp(movieDate, 'g')
            dbData = await db.collection("movies").findOne({
                $and: [
                    { movie_name: lineRegx },
                    { movie_name: dateRegx }
                ]
            })

            if (dbData) {
                // console.log('from db')
                return { id, data: dbData }
            } else if (temp.indexOf("(") !== -1) {
                tempName = temp.slice(0, temp.indexOf("("))
                dbData = await db.collection("movies").findOne({
                    $and: [
                        { movie_name: new RegExp(tempName, 'i') },
                        { movie_name: dateRegx }
                    ]
                })
                if (dbData) return { id, data: dbData };
            };

        }

        let data = await searchFirstSite(name + " " + movieDate, true)
        if (!data) {
            // console.log('not found in first going to second site')
            data = await searchSecondSite(name + " " + movieDate, true)
        };
        return { id, data, fromSite: true };



    }

    async function readFile(filePath, callback) {

        try {

            const data = fs.readFileSync(filePath, 'UTF-8');

            const lines = data.split(/\r?\n/);

            for (let index = 0; index < lines.length; index++) {
                await callback(lines[index]);
            }
        } catch (error) {
            return callbacks.onError({
                error: error
            })
        }
    }


    return {
        crawl,
        on,
        override,
        crawlSinglePage,
        search,
        readFile
    }
}




module.exports = scrapyJS


