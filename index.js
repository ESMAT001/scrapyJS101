const scrapyJS = require('./src/scrapy')

const baseURL = 'https://www.film2movie.asia/category/download-film'
const firstPage = 1
const lastPage = 2

const spider = scrapyJS(baseURL, firstPage, lastPage, {
    nameSelector: 'div.content > div > p',
    downloadLinkSelector: "div.content > *",
    mainPageLinkSelector: 'div.title > h2 > a'
})

spider.on('finished', () => {
    console.log('crawling finished')
})

spider.on("error", (error) => {
    console.log(error)
})

spider.on('crawled', (data) => {
    console.log(data)
})

spider.override("extractDownloadLinks", (nodes) => {
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
        const englishLangRegx = /[a-zA-Z 0-9]/g
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
    if (!subLang) {
        downloadLinks.original_lang = extractLinks(links)
    } else {
        downloadLinks = {
            [subLang]: extractLinks(links.slice(indexes[0], indexes[1])),
            original_lang: extractLinks(links.slice(indexes[1], indexes[2])),
        }
    }

    return downloadLinks;
})

spider.crawl()
// spider.crawlSinglePage("https://www.film2movie.asia/87175/%d8%af%d8%a7%d9%86%d9%84%d9%88%d8%af-%d9%81%db%8c%d9%84%d9%85-f9-2021/", 12)