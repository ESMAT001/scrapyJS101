const scrapyJS = require('./src/scrapy')

const mongodb = require("mongodb")
const MongoClient = mongodb.MongoClient


const baseURL = 'https://www.film2movie.asia/category/download-film'
const dbURL = 'mongodb://127.0.0.1:27017'
const dbName = 'media'



const firstPage = 819
const lastPage = 1395

const spider = scrapyJS(baseURL, firstPage, lastPage, {
    nameSelector: 'div.content > div > p',
    downloadLinkSelector: "div.content > *",
    mainPageLinkSelector: 'div.title > h2 > a',
    maxThreads: 8
})

spider.on('finished', () => {
    console.log('crawling finished')
})

spider.on("error", (error) => {
    console.log(error)
})


MongoClient.connect(dbURL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        const db = client.db(dbName)
        console.log('connected ')
        spider.on('crawled', (data) => {
            db.collection("movies").insertOne(data)
                .then(result => console.log('inserted!', result.ops))
                .catch(error => console.log('error on insertion :', error))
        })
        // spider.crawlSinglePage('https://www.film2movie.asia/53376/%d8%af%d8%a7%d9%86%d9%84%d9%88%d8%af-%d9%81%db%8c%d9%84%d9%85-blood-honey-2017/',818)
        spider.crawl()


    })





// spider.crawlSinglePage("https://www.film2movie.asia/109205/%d8%af%d8%a7%d9%86%d9%84%d9%88%d8%af-%d9%81%db%8c%d9%84%d9%85-alien-artifacts-the-lost-world-2019/", 12)



