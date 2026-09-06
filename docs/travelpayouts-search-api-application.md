# Travelpayouts Flight Search API application

Travelpayouts grants the real-time Flight Search API only to projects
with a confirmed 50,000 monthly active users (MAU), with screenshots.
They say plainly that requests below that are not considered and not to
submit one. So this is ready to send the month CloudHenry passes 50,000
unique visitors in Ghost analytics. Until then the site keeps using the
Data API (cached fares) plus the Ryanair feed.

Where to send: Travelpayouts Help Center, "Submit a request"
(https://support.travelpayouts.com/hc/en-us/requests/new), or reply to
Henry's partner manager. Attach the Ghost analytics screenshot showing
the 30-day unique visitors, and one screenshot of the search page.

## Draft request

Subject: Flight Search API access for cloudhenry.com (partner ID 764584)

Hello,

I run CloudHenry (https://www.cloudhenry.com), a UK flight-deals
membership site for 12 UK airports, already integrated with the
Aviasales Data API and the Aviasales affiliate programme (marker
764584, trs 562291). I would like access to the Flight Search API.

Traffic: [N] monthly active users over the last 30 days, per the
attached Ghost analytics screenshot. Most traffic comes from my
Instagram account @henryoscarmoores (about 458,000 followers), where I
post flight deals several times a week.

Why the standard tools do not fit: CloudHenry is a paid membership
(40 days free, then 2.99 pounds a month). Members search from their
home airport on https://www.cloudhenry.com/search/ and the page gates
every booking link behind the membership. A search form or White Label
would take the member off the site to Aviasales, which breaks the
member experience and the gating. The Data API only holds fares other
people have searched, so a member asking for a specific weekend often
sees nothing. Real-time results would let the search answer any
dates.

How the search would work: the member picks origin (one of the 12 UK
airports or "London, any airport"), destination or "Everywhere", dates
or a whole month, one way or return, and a price cap. The page starts
a search with your API from the browser (the user's own IP, User-Agent
and Referer are sent, one search per user action, cached for the
15-minute result window), polls results until is_over, and renders
one card per itinerary: airline, times, stops, price, and a Buy button
that generates the purchase link with our marker. Signed-out visitors
see fares but the Buy button opens the membership plan chooser.

Interface: the search page is live today at
https://www.cloudhenry.com/search/ (screenshot attached). Real-time
results would fill the same cards.

Expected volume: about [X] searches a day from [N] MAU.

Thank you,
Henry Moores
henryswalk@gmail.com
