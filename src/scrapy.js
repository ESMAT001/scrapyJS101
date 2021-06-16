const axios = require('axios');
const got = require('got')
const jsdom = require("jsdom");
const { JSDOM } = jsdom;



const scrapyJS = function (baseURL = {}, firstPage = 1, lastPage = 1, options = {}) {

    const getPage = (function* nextPage() {
        let index = firstPage;
        while (index <= lastPage) {
            yield index++
        }
    })()

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


    async function* scrapeMainPage(url) {

        try {
            var html = await got(url)
        } catch (error) {
            return callbacks.onError({
                error: error.response.body,
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

    async function crawlSinglePage(url, page) {
        try {
            var html = await got(url)
            const dom = new JSDOM(html.body)
            const movieName = dom.window.document.querySelector(options.nameSelector).textContent
            return callbacks.onCrawled({ 'from page': page, movieName })
        } catch (error) {
            callbacks.onError({
                error: error.response.body,
                url,
                page
            })
            return crawlSinglePage(url, page)
        }

    }

    async function crawl() {
        console.log('crawling started')
        let page = getPage.next()
        const regx = /سریال/
        const regx2 = /[a-zA-Z]/
        while (!page.done) {
            const url = baseURL + "/page/" + page.value + "/"
            console.log(url)
            const mainPageScrapper = scrapeMainPage(url)
            let link = await mainPageScrapper.next()

            while (!link.done) {
                if (!regx.test(link.value) && regx2.test(link.value)) {
                    await crawlSinglePage(link.value, page.value)
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
    }
}




module.exports = scrapyJS


