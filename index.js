const scrapyJS = require('./src/scrapy')
const fs = require('fs')
const mongodb = require("mongodb")

const MongoClient = mongodb.MongoClient


const baseURL = ''
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
    .then(async client => {
        const db = client.db(dbName)
        console.log('connected ')
        spider.on('crawled', (data) => {
            console.log('from listener')
            console.log(data)
            // db.collection("movies").insertOne(data)
            //     .then(result => console.log('inserted!', result.ops))
            //     .catch(error => console.log('error on insertion :', error))
        })


        // async function insert({ id, data }) {
        //     id = parseInt(id)
        //     console.log(id, data.movie_name)
        //     if (await db.collection("movie").findOne({ id })) return;

        //     let movieData = await db.collection("tmdb").findOne({ id })


        //     if (!movieData) return;

        //     movieData.download_links = data.download_links
        //     const imgPath = 'https://image.tmdb.org/t/p/w500'
        //     movieData.backdrop_path = imgPath + movieData.backdrop_path
        //     movieData.poster_path = imgPath + movieData.poster_path
        //     await db.collection("movie").insertOne(movieData)
        //     console.log(id, data.movie_name, 'inserted')


        // }
        // spider.readFile('notFound.txt', async function (line) {
        //     const data = await spider.search(line, db)
        //     if (data.data) await insert(data);
        // })

        spider.search("3 587807 Tom & Jerry 2021")

        //         // spider.crawl()

        // spider.crawlSinglePage("https://www.film2movie.asia/97001/%d8%af%d8%a7%d9%86%d9%84%d9%88%d8%af-%d8%b3%d8%b1%db%8c%d8%a7%d9%84-zack-snyders-justice-league/")

    })













