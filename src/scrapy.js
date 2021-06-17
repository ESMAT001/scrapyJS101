const axios = require('axios');
const got = require('got')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;



const scrapyJS = function (baseURL = {}, firstPage = 1, lastPage = 1, options = {}) {
    let threads = 0
    const maxThreads = options.maxThreads || 8
    const retryLimit = options.retryLimit || 40
    const timeOutLimit = options.timeOutLimit * 1000 || 20 * 1000


    const getPage = (function* nextPage() {
        let index = firstPage;
        while (index <= lastPage) {
            yield index++
        }
    })()

    let extractDownloadLinks = function (nodes) {
        let startIndex = null
        let endIndex = null
        for (let index = 0; index < nodes.length; index++) {
            if (nodes[index].nodeName === "H3" && startIndex === null) {
                startIndex = ++index
            } else if (nodes[index].nodeName === "HR" && endIndex === null) {
                endIndex = index
            }
        }
        return Array.from(nodes).slice(startIndex, endIndex);
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
        console.log('from',page,'crawling',url)
        try {

            var html = await got(url, {
                retry: { limit: retryLimit },
                timeout: timeOutLimit
            })
            const dom = new JSDOM(html.body)
            const movieName = dom.window.document.querySelector(options.nameSelector).textContent
            const nodes = dom.window.document.querySelectorAll(options.downloadLinkSelector)

            const downloadLinks = extractDownloadLinks(nodes)

            return callbacks.onCrawled({ 'from page': page, movieName, downloadLinks })
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
        const regx2 = /[a-zA-Z]/
        while (!page.done) {
            const url = baseURL + "/page/" + page.value + "/"
            console.log('threads',threads,url)
            const mainPageScrapper = scrapeMainPage(url)
            let link = await mainPageScrapper.next()
            while (!link.done) {
                if (!regx.test(link.value) && regx2.test(link.value)) {

                    if (threads < maxThreads) {
                        threads++
                        console.log('adding thread')
                        crawlSinglePage(link.value, page.value)
                    } else {
                        threads--
                        console.log('removing thread')
                        await crawlSinglePage(link.value, page.value)
                    }

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


