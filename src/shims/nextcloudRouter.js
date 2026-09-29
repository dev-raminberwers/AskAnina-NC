/** Web-jas van @nextcloud/router: er is geen Nextcloud, dus geen server-URL's. Wordt in de web-jas nooit echt aangeroepen. */
export function generateRemoteUrl(path) { return '/' + path }
export function generateUrl(path) { return path }
