const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: false });    
    const page = await browser.newPage();

    // Set the default navigation timeout to 60 seconds
    page.setDefaultNavigationTimeout(60000);

    // Navigate to the login page
    await page.goto('https://appsumo.com/accounts/login/');

    // Perform login
    await page.type("#id_login", 'dev.hisaria@gmail.com', { delay: 100 });
    await page.type("#id_password", 'Test@123', { delay: 100 });
    await page.click("#login_submit_button");

    await delay(2000);

      // Navigate directly to the history page
    await page.goto('https://appsumo.com/account/history/', { waitUntil: 'networkidle0' });
  
      if (page.url() !== 'https://appsumo.com/account/history/') {
        console.error('Failed to navigate to the history page.');
        await browser.close();
        return;
    }
    const deals = [];
    let hasNextPage = true;

    while (hasNextPage) {
        // Extract data from the current page
        const pageDeals = await page.evaluate(() => {
            const dealItems = document.querySelectorAll('ul.history li');
            const deals = [];

            dealItems.forEach(item => {
                let deal = {};
                let date_temp = item.querySelector('.date').textContent.trim();
                let date = date_temp.replace(/\./g, '/');
                let id = item.querySelector('.id a').textContent.trim();
                let url = 'https://appsumo.com' + item.querySelector('.deals a').getAttribute('href');
                let amount = item.querySelector('.price').textContent
                    .replace('USD', '')
                    .replace('$', '')
                    .replace('.00', '')
                    .trim();
                
                deal['recordId'] = id;
                deal['Amount_c'] = amount;
                deal['Next_PaymentDate_c'] = date;
                deal['Seller_c'] = 'Appsumo';
                deal['Link_c'] = '';
                deal['Name'] = item.querySelector('.deals a').textContent.trim();
                deal['Category_c'] = '';
                deal['identifier'] = url;

                deals.push(deal);
            });

            return deals;
        });

        deals.push(...pageDeals);

        // Check if the "Next" button is available and not disabled
        hasNextPage = await page.evaluate(() => {
            const nextButton = document.querySelector('.page-next a');
            return nextButton && !nextButton.closest('li').classList.contains('disabled');
        });

        if (hasNextPage) {
            try {
                // Ensure the element is in the viewport before clicking
                await page.evaluate(() => {
                    document.querySelector('.page-next a').scrollIntoView();
                });

                // Wait for the "Next" button to be clickable
                await page.waitForSelector('.page-next a', { visible: true });
                await page.waitForFunction(() => {
                    const nextButton = document.querySelector('.page-next a');
                    return nextButton && nextButton.offsetParent !== null; // Check if the element is visible
                });
                await Promise.all([
                    page.click('.page-next a'),
                    page.waitForNavigation({ waitUntil: 'networkidle0' }),
                ]);
            } catch (error) {
                console.error('Error clicking the "Next" button:', error);
                hasNextPage = false;
            }
        }
    }

    // // Custom delay function
    function delay(time) {
        return new Promise(function(resolve) { 
            setTimeout(resolve, time);
        });
    }

    // Function to extract the Link_c value from each deal's identifier URL
    async function getLinkCValue(deal, browser) {
        const newPage = await browser.newPage();
        await newPage.goto(deal.identifier);

        // Wait for 5 seconds (5000 milliseconds) using the custom delay function
        await new Promise(resolve => setTimeout(resolve, 5000));

        const currentUrl = newPage.url();
        if (currentUrl.includes("https://appsumo.com/account/redemption/")) {
            try {
                const productPageLink = await newPage.evaluate(() => {
                    const container = document.querySelector('.redemption-product-info-container');
                    if (container) {
                        return "https://appsumo.com" + container.querySelector("a").getAttribute("href");
                    }
                    return null;
                });
                console.log("productPageLink",productPageLink)
                if (productPageLink) {
                    deal.identifier = productPageLink;
                    await newPage.goto(productPageLink, { waitUntil: 'networkidle0' });
                }
                if (productPageLink.includes("https://appsumo.com/products/")) {
                    try {
                        const productLink = await newPage.evaluate(() => {
                    const section = document.querySelector("section.mt-3");

                            if (section) {
                                const links = section.querySelectorAll("a");
                                if (links.length) {
                                    return links[links.length - 1].getAttribute("href");
                                }
                            }
                            return null;
                        });
                        console.log("productLink",productLink)
                        if (productLink) {
                            deal.Link_c = productLink;
                        }
                    } catch (error) {
                        console.error('Error extracting product link:', error);
                    }
                }
            } catch (error) {
                console.error('Error extracting product page link:', error);
            }
        }
         if (currentUrl.includes("https://appsumo.com/products/")) {
            try {
                console.log("dddddd",document.querySelector("section.mt-3"))
                const productLink = await newPage.evaluate(() => {
                    const section = document.querySelector("section.mt-3");
                    if (section) {
                        const links = section.querySelectorAll("a");
                        if (links.length) {
                            return links[links.length - 1].getAttribute("href");
                        }
                    }
                    return null;
                });
                
                if (productLink) {
                    deal.Link_c = productLink;
                }
            } catch (error) {
                console.error('Error extracting product link:', error);
            }
        }

        await newPage.close();
    }

    // // Iterate over deals to fetch Link_c value
    for (let deal of deals) {
        await getLinkCValue(deal, browser);
    }

    const user_id = "V1lTEbwZv0gW66jaSbODIiQBTsr2"; // Replace with actual user ID
    const post_data = {
        "data": {
            "userId": user_id,
            "deals": deals
        }
    };

    try {
        const response = await fetch("https://us-central1-trackr-98e4b.cloudfunctions.net/onBulkImportFromAppsumo", {
            method: 'POST',
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(post_data)
        });

        const response_data = await response.text();
        console.log("ok");
        console.log(response_data);
        if (response_data !== "Internal Server Error") {
            console.log('apiRequestSuccess');
        } else {
            console.log('apiRequestError');
        }
    } catch (error) {
        console.log(error);
    }

    console.log(deals, deals.length);

    await browser.close();
})();
