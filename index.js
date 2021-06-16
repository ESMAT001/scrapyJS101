const scrapyJS= require('./src/scrapy')

const baseURL = 'https://www.film2movie.asia/category/download-film'
const firstPage = 1
const lastPage = 1395

const spider = scrapyJS(baseURL,firstPage,lastPage,{
    nameSelector:'div.content > div > p',
    downloadLinkSelector:"div.content > *",
    mainPageLinkSelector:'div.title > h2 > a'
})

spider.on('finished',()=>{
    console.log('crawling finished')
})

spider.on("error",(error)=>{
    console.log(error)
})

spider.on('crawled',(data)=>{
    console.log(data)
})

spider.crawl()
