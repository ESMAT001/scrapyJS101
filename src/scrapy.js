const axios = require('axios');
const got = require('got')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;



const scrapyJS = function (baseURL = {}, firstPage = 1, lastPage = 1, options = {}) {
    let threads = 0
    const maxThreads = options.maxThreads || 8
    const retryLimit = options.retryLimit || 40
    const timeOutLimit = options.timeOutLimit * 1000 || 20 * 1000
    const englishLangRegx = /[a-zA-Z 0-9]/g

    const getPage = (function* nextPage() {
        let index = firstPage;
        while (index <= lastPage) {
            yield index++
        }
    })()

    let extractDownloadLinks = function (nodes) {

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




    async function crawlSinglePage(url, page) {
        // console.log('from', page, 'crawling', url)
        try {

            var html = await got(url, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
            const dom = new JSDOM(html.body)
            const movieName = dom.window.document.querySelector(options.nameSelector).textContent.match(englishLangRegx).join("").trim()
            
            const nodes = dom.window.document.querySelectorAll(options.downloadLinkSelector)

            const downloadLinks = extractDownloadLinks(nodes)

            return callbacks.onCrawled({
                movie_name: movieName,
                download_links: downloadLinks
            })
        } catch (error) {
            callbacks.onError({
                error: error,
                url,
                page
            })
            return crawlSinglePage(url, page)
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

        console.log('main page scrapped')

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
                        crawlSinglePage(link.value, page.value)
                    } else {
                        threads--
                        console.log('removing thread')
                        await crawlSinglePage(link.value, page.value)
                    }

                } else {
                    // console.log('skipped ', decodeURI(link.value))
                }
                link = await mainPageScrapper.next()
            }
            page = getPage.next()

        }

        return callbacks.onFinished() ? callbacks.onFinished !== undefined : undefined
    }



    return {
        crawl,
        on,
        override,
        crawlSinglePage
    }
}




module.exports = scrapyJS


