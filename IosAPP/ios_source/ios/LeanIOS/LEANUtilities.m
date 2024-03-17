//
//  LEANUtilities.m
//  GoNativeIOS
//
//  Created by Weiyin He on 2/4/14.
//  Copyright (c) 2014 Weiyin He. All rights reserved.
//

#import <MobileCoreServices/MobileCoreServices.h>
#import "GonativeIO-Swift.h"
#import "LEANUtilities.h"
#import "LEANAppDelegate.h"

@implementation LEANUtilities

+ (NSDictionary*) dictionaryFromQueryString: (NSString*) string
{
    NSMutableDictionary *dictParameters = [[NSMutableDictionary alloc] init];
    NSArray *arrParameters = [string componentsSeparatedByString:@"&"];
    for (int i = 0; i < [arrParameters count]; i++) {
        NSArray *arrKeyValue = [arrParameters[i] componentsSeparatedByString:@"="];
        if ([arrKeyValue count] >= 2) {
            NSMutableString *strKey = [NSMutableString stringWithCapacity:0];
            [strKey setString:[[arrKeyValue[0] lowercaseString] stringByRemovingPercentEncoding]];
            NSMutableString *strValue   = [NSMutableString stringWithCapacity:0];
            [strValue setString:[[arrKeyValue[1]  stringByReplacingOccurrencesOfString:@"+" withString:@" "] stringByRemovingPercentEncoding]];
            if (strKey.length > 0) dictParameters[strKey] = strValue;
        }
    }
    
    return dictParameters;
}

+(NSString*)urlEscapeString:(NSString *)unencodedString
{
    return [unencodedString stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]];
}

+(NSString*)urlQueryStringWithDictionary:(NSDictionary*) dictionary{
    NSMutableString *result = [[NSMutableString alloc] init];
    
    BOOL first = YES;
    for (id key in dictionary){
        NSString *keyString = [key description];
        NSString *valueString = [dictionary[key] description];
        
        if (first) {
            [result appendFormat:@"%@=%@", [self urlEscapeString:keyString], [self urlEscapeString:valueString]];
            first = NO;
        }
        else {
            [result appendFormat:@"&%@=%@", [self urlEscapeString:keyString], [self urlEscapeString:valueString]];
        }
    }
    
    return result;
}


+(NSString*)addQueryStringToUrlString:(NSString *)urlString withDictionary:(NSDictionary *)dictionary
{
    NSMutableString *urlWithQuerystring = [[NSMutableString alloc] initWithString:urlString];
    
    for (id key in dictionary) {
        NSString *keyString = [key description];
        NSString *valueString = [dictionary[key] description];
        
        if ([urlWithQuerystring rangeOfString:@"?"].location == NSNotFound) {
            [urlWithQuerystring appendFormat:@"?%@=%@", [self urlEscapeString:keyString], [self urlEscapeString:valueString]];
        } else {
            [urlWithQuerystring appendFormat:@"&%@=%@", [self urlEscapeString:keyString], [self urlEscapeString:valueString]];
        }
    }
    return urlWithQuerystring;
}

+(NSDictionary*)parseQueryParamsWithUrl:(NSURL*)url
{
    NSString *query = url.query;
    if (!query) return @{};
    
    NSMutableDictionary *result = [NSMutableDictionary dictionary];

    NSArray * queryComponents = [query componentsSeparatedByString:@"&"];
    for (NSString *keyValue in queryComponents) {
        NSArray *pairComponents = [keyValue componentsSeparatedByString:@"="];
        if (pairComponents.count != 2) continue;
        
        NSString *key = [[pairComponents firstObject] stringByRemovingPercentEncoding];
        NSString *value = [[pairComponents lastObject] stringByRemovingPercentEncoding];
        
        // parse boolean string to boolean
        if([value isEqualToString:@"true"] || [value isEqualToString:@"false"]){
            result[key] = [NSNumber numberWithBool:[value isEqualToString:@"true"]];
        } else { // if not boolean, assign the string value as it is
            result[key] = value;
        }
    }
    
    return result;
}

+(NSURL*)urlWithString:(NSString*)string
{
    static NSCharacterSet *myCharacterSet = nil;
    if (!myCharacterSet) {
        NSMutableCharacterSet *set = [[NSMutableCharacterSet URLQueryAllowedCharacterSet] mutableCopy];
        [set addCharactersInString:@"#%"];
        myCharacterSet = set;
    }
    
    return [NSURL URLWithString:[string stringByAddingPercentEncodingWithAllowedCharacters:myCharacterSet]];
}

+(NSString*)utiFromMimetype:(NSString *)mimeType
{
    if (!mimeType) return nil;
    CFStringRef MIMEType = (__bridge CFStringRef)mimeType;
    CFStringRef UTI = UTTypeCreatePreferredIdentifierForTag(kUTTagClassMIMEType, MIMEType, NULL);
    NSString *utiString = (__bridge_transfer NSString *)UTI;
    return utiString;
}

+(BOOL)isValidEmail:(NSString*)email
{
    NSString *emailRegex = @"\\S+@\\S+\\.\\S+";
    NSPredicate *emailTest = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", emailRegex];
    return [emailTest evaluateWithObject:email];
}

+(NSString *)stripHTML:(NSString*)x replaceWith:(NSString*) replacement {
    if (![x isKindOfClass:[NSString class]]) {
        return nil;
    }
    
    if (replacement == nil) {
        replacement = @"";
    }
    
    NSRange r;
    NSString *s = [NSString stringWithString:x];
    while ((r = [s rangeOfString:@"<[^>]+>" options:NSRegularExpressionSearch]).location != NSNotFound)
        s = [s stringByReplacingCharactersInRange:r withString:replacement];
    return s;
}

// Assumes input like "#00FF00" (#RRGGBB).
+ (UIColor *)colorFromHexString:(NSString *)hexString {
    if (![hexString isKindOfClass:[NSString class]] || ![hexString hasPrefix:@"#"]) {
        return nil;
    }
    
    unsigned rgbValue = 0;
    NSScanner *scanner = [NSScanner scannerWithString:hexString];
    [scanner setScanLocation:1]; // bypass '#' character
    [scanner scanHexInt:&rgbValue];
    return [UIColor colorWithRed:((rgbValue & 0xFF0000) >> 16)/255.0 green:((rgbValue & 0xFF00) >> 8)/255.0 blue:(rgbValue & 0xFF)/255.0 alpha:1.0];
}

+(UIColor*)colorWithAlphaFromHexString:(NSString*)hexString {
    NSString *colorString = [[hexString stringByReplacingOccurrencesOfString: @"#" withString: @""] uppercaseString];
    CGFloat alpha, red, blue, green;
    switch ([colorString length]) {
        case 3: // #RGB
            alpha = 1.0f;
            red   = [self colorComponentFrom: colorString start: 0 length: 1];
            green = [self colorComponentFrom: colorString start: 1 length: 1];
            blue  = [self colorComponentFrom: colorString start: 2 length: 1];
            break;
        case 4: // #ARGB
            alpha = [self colorComponentFrom: colorString start: 0 length: 1];
            red   = [self colorComponentFrom: colorString start: 1 length: 1];
            green = [self colorComponentFrom: colorString start: 2 length: 1];
            blue  = [self colorComponentFrom: colorString start: 3 length: 1];
            break;
        case 6: // #RRGGBB
            alpha = 1.0f;
            red   = [self colorComponentFrom: colorString start: 0 length: 2];
            green = [self colorComponentFrom: colorString start: 2 length: 2];
            blue  = [self colorComponentFrom: colorString start: 4 length: 2];
            break;
        case 8: // #AARRGGBB
            alpha = [self colorComponentFrom: colorString start: 0 length: 2];
            red   = [self colorComponentFrom: colorString start: 2 length: 2];
            green = [self colorComponentFrom: colorString start: 4 length: 2];
            blue  = [self colorComponentFrom: colorString start: 6 length: 2];
            break;
        default:
            NSLog(@"Color value %@ is invalid.  It should be a hex value of the form #RBG, #ARGB, #RRGGBB, or #AARRGGBB", hexString);
            return nil;
    }
    return [UIColor colorWithRed: red green: green blue: blue alpha: alpha];
}

+ (CGFloat) colorComponentFrom: (NSString *) string start: (NSUInteger) start length: (NSUInteger) length {
    NSString *substring = [string substringWithRange: NSMakeRange(start, length)];
    NSString *fullHex = length == 2 ? substring : [NSString stringWithFormat: @"%@%@", substring, substring];
    unsigned hexComponent;
    [[NSScanner scannerWithString: fullHex] scanHexInt: &hexComponent];
    return hexComponent / 255.0;
}

// replaces navigator.geolocation
+ (void)overrideGeolocation:(UIView*)wv {
    if (!wv) {
        return;
    }
    NSString *js = @"var median_geolocation_variables = { "
    "    successFunctions: [], "
    "    failureFunctions: [], "
    "    watchSuccess: {}, "
    "    watchFailure: {}, "
    "    nextWatchId: 1 "
    "}; "
    " "
    "function median_geolocation_failed(data) { "
    "    if (!median_geolocation_variables || !Array.isArray(median_geolocation_variables.failureFunctions)) { "
    "        return; "
    "    } "
    " "
    "    var f; "
    " "
    "    for (var i = 0; i < median_geolocation_variables.failureFunctions.length; i++) { "
    "        f = median_geolocation_variables.failureFunctions[i]; "
    "        if (typeof f === 'function') { "
    "            f(data); "
    "        } "
    "    } "
    "    median_geolocation_variables.failureFunctions = []; "
    "    median_geolocation_variables.successFunctions = []; "
    " "
    "    for (var prop in median_geolocation_variables.watchFailure) { "
    "        if (median_geolocation_variables.watchFailure.hasOwnProperty(prop)) { "
    "            f = median_geolocation_variables.watchFailure[prop]; "
    "            if (typeof f === 'function') { "
    "                f(data); "
    "            } "
    "        } "
    "    } "
    "} "
    " "
    "function median_geolocation_received(data) { "
    "    if (!median_geolocation_variables || !Array.isArray(median_geolocation_variables.successFunctions)) { "
    "        return; "
    "    } "
    " "
    "    var f; "
    " "
    "    for (var i = 0; i < median_geolocation_variables.successFunctions.length; i++) { "
    "        f = median_geolocation_variables.successFunctions[i]; "
    "        if (typeof f === 'function') { "
    "            f(data); "
    "        } "
    "    } "
    "    median_geolocation_variables.failureFunctions = []; "
    "    median_geolocation_variables.successFunctions = []; "
    " "
    "    for (var prop in median_geolocation_variables.watchSuccess) { "
    "        if (median_geolocation_variables.watchSuccess.hasOwnProperty(prop)) { "
    "            f = median_geolocation_variables.watchSuccess[prop]; "
    "            if (typeof f === 'function') { "
    "                f(data); "
    "            } "
    "        } "
    "    } "
    "} "
    " "
    " "
    "navigator.geolocation.getCurrentPosition = function(success, failure) { "
    "    if (typeof success === 'function') median_geolocation_variables.successFunctions.push(success); "
    "    if (typeof failure === 'function') median_geolocation_variables.failureFunctions.push(success); "
    "    location.href = 'median://geolocationShim/requestLocation'; "
    "}; "
    " "
    "navigator.geolocation.watchPosition = function(success, failure) { "
    "    var watchId = median_geolocation_variables.nextWatchId; "
    "    median_geolocation_variables.nextWatchId++; "
    " "
    "    if (typeof success === 'function') median_geolocation_variables.watchSuccess[watchId] = success; "
    "    if (typeof failure === 'function') median_geolocation_variables.watchFailure[watchId] = failure; "
    " "
    "    location.href = 'median://geolocationShim/startWatchingLocation'; "
    " "
    "    return watchId; "
    "}; "
    " "
    "navigator.geolocation.clearWatch = function(watchId) { "
    "    if (!watchId || typeof watchId !== 'number') return; "
    " "
    "    delete median_geolocation_variables.watchSuccess[watchId]; "
    "    delete median_geolocation_variables.watchFailure[watchId]; "
    " "
    "    function isEmpty(obj) { "
    "        for(var prop in obj) { "
    "            if(obj.hasOwnProperty(prop)) "
    "                return false; "
    "        } "
    "        return JSON.stringify(obj) === JSON.stringify({}); "
    "    } "
    " "
    "    if (isEmpty(median_geolocation_variables.watchSuccess)) { "
    "        location.href = 'median://geolocationShim/stopWatchingLocation'; "
    "    } "
    "}; "
    " "
    "if (typeof window.gonative_geolocation_ready === 'function') { "
    "    window.gonative_geolocation_ready(); "
    "} ";

    
    if ([wv isKindOfClass:NSClassFromString(@"WKWebView")]) {
        WKWebView *webview = (WKWebView*)wv;
        [webview evaluateJavaScript:js completionHandler:nil];
    }
}

+ (void)matchStatusBarToBodyBackgroundColor:(WKWebView *)webview enabled:(BOOL)enabled {
    if (!webview) return;
    NSString *js = enabled
        ? @" window.addEventListener('load', gonative_match_statusbar_to_body_background_color); "
        : @" window.removeEventListener('load', gonative_match_statusbar_to_body_background_color); ";
    [webview evaluateJavaScript:js completionHandler:nil];
}

+(NSString*)jsWrapString:(NSString*)string
{
    return [NSString stringWithFormat:@"decodeURIComponent(\"%@\")", [string stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet URLQueryAllowedCharacterSet]]];
}

+(NSString*)capitalizeWords:(NSString *)string
{
    NSMutableString *result = [string mutableCopy];
    [result enumerateSubstringsInRange:NSMakeRange(0, [result length])
                               options:NSStringEnumerationByWords
                            usingBlock:^(NSString *substring, NSRange substringRange, NSRange enclosingRange, BOOL *stop) {
                                [result replaceCharactersInRange:NSMakeRange(substringRange.location, 1)
                                                      withString:[[substring substringToIndex:1] uppercaseString]];
                            }];
    
    return result;
}


+(NSString*)getLaunchImageName
{
    
    NSArray* images= @[@"LaunchImage.png", @"LaunchImage@2x.png",@"LaunchImage-700@2x.png",@"LaunchImage-568h@2x.png",@"LaunchImage-700-568h@2x.png",@"LaunchImage-700-Portrait@2x~ipad.png",@"LaunchImage-Portrait@2x~ipad.png",@"LaunchImage-700-Portrait~ipad.png",@"LaunchImage-Portrait~ipad.png",@"LaunchImage-Landscape@2x~ipad.png",@"LaunchImage-700-Landscape@2x~ipad.png",@"LaunchImage-Landscape~ipad.png",@"LaunchImage-700-Landscape~ipad.png"];
    
    UIImage *splashImage;
    
    if ([self isDeviceiPhone])
    {
        if ([self isDeviceiPhone4] && [self isDeviceRetina])
        {
            splashImage = [UIImage imageNamed:images[1]];
            if (splashImage.size.width!=0)
                return images[1];
            else
                return images[2];
        }
        else if ([self isDeviceiPhone5])
        {
            splashImage = [UIImage imageNamed:images[1]];
            if (splashImage.size.width!=0)
                return images[3];
            else
                return images[4];
        }
        else if ([self isDeviceiPhone6])
        {
            return @"LaunchImage-800-667h@2x.png";
        }
        else if ([self isDeviceiPhone6Plus])
        {
            if ([UIApplication sharedApplication].isInterfaceOrientationPortrait) {
                return @"LaunchImage-800-Portrait-736h@3x.png";
            } else {
                return @"LaunchImage-800-Landscape-736h@3x.png";
            }
        }
        else
            return images[0]; //Non-retina iPhone
    }
    else if ([UIApplication sharedApplication].isInterfaceOrientationPortrait)//iPad Portrait
    {
        if ([self isDeviceRetina])
        {
            splashImage = [UIImage imageNamed:images[5]];
            if (splashImage.size.width!=0)
                return images[5];
            else
                return images[6];
        }
        else
        {
            splashImage = [UIImage imageNamed:images[7]];
            if (splashImage.size.width!=0)
                return images[7];
            else
                return images[8];
        }
        
    }
    else
    {
        if ([self isDeviceRetina])
        {
            splashImage = [UIImage imageNamed:images[9]];
            if (splashImage.size.width!=0)
                return images[9];
            else
                return images[10];
        }
        else
        {
            splashImage = [UIImage imageNamed:images[11]];
            if (splashImage.size.width!=0)
                return images[11];
            else
                return images[12];
        }
    }
}



+(BOOL)isDeviceiPhone
{
    if (UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone)
    {
        return TRUE;
    }
    
    return FALSE;
}

+(BOOL)isDeviceiPhone4
{
    if ([[UIScreen mainScreen] bounds].size.height==480)
        return TRUE;
    
    return FALSE;
}


+(BOOL)isDeviceRetina
{
    if ([[UIScreen mainScreen] respondsToSelector:@selector(displayLinkWithTarget:selector:)] &&
        ([UIScreen mainScreen].scale == 2.0))        // Retina display
    {
        return TRUE;
    }
    else                                          // non-Retina display
    {
        return FALSE;
    }
}


+(BOOL)isDeviceiPhone5
{
    CGSize size = [UIScreen mainScreen].bounds.size;
    return UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone && size.width == 320 && size.height == 568;
}

+(BOOL)isDeviceiPhone6
{
    CGSize size = [UIScreen mainScreen].bounds.size;
    return UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone && size.width == 375 && size.height == 667;
}

+(BOOL)isDeviceiPhone6Plus
{
    CGSize size = [UIScreen mainScreen].bounds.size;
    return UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone &&
    ((size.width == 414 && size.height == 736) ||
     (size.width == 736 && size.height == 414));
}

+(void)injectCss:(NSString *)cssFileName toWebview:(WKWebView *)webview {
    NSURL *cssFile = [[NSBundle mainBundle] URLForResource:cssFileName withExtension:@"css"];
    if (!cssFile) return;
    
    NSString *css = [NSString stringWithContentsOfURL:cssFile encoding:NSUTF8StringEncoding error:nil];
    NSString *cssTemplate = @" "
    " var gonative_styleElement = document.createElement('style'); "
    " document.documentElement.appendChild(gonative_styleElement); "
    " gonative_styleElement.textContent = %@; "
    " ";
    
    NSString *scriptSource = [NSString stringWithFormat:cssTemplate, [LEANUtilities jsWrapString:css]];
    WKUserScript *userScript = [[NSClassFromString(@"WKUserScript") alloc] initWithSource:scriptSource injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES];
    [webview.configuration.userContentController addUserScript:userScript];
}

+(void)injectJs:(NSString *)jsFileName ToWebview:(WKWebView *)webview {
    NSURL *jsFile = [[NSBundle mainBundle] URLForResource:jsFileName withExtension:@"js"];
    if (!jsFile) return;
    
    NSString *javascript = [NSString stringWithContentsOfURL:jsFile encoding:NSUTF8StringEncoding error:nil];
    WKUserScript *userScript = [[NSClassFromString(@"WKUserScript") alloc] initWithSource:javascript injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:YES];
    [webview.configuration.userContentController addUserScript:userScript];
}

+(void)configureWebView:(UIView*)wv
{
    wv.frame = [[UIScreen mainScreen] bounds];
    wv.opaque = YES;
    
    // we are using autolayout, so disable autoresizingmask stuff
    [wv setTranslatesAutoresizingMaskIntoConstraints:NO];
    
    // disable double-tap that causes page to shift
    [self removeDoubleTapFromView:wv];
    
    if ([wv isKindOfClass:NSClassFromString(@"WKWebView")]) {
        WKWebView *webview = (WKWebView*)wv;
        webview.scrollView.bounces = NO;
        if (@available(iOS 11.0, *)) {
            webview.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
        }
        
        GoNativeAppConfig *appConfig = [GoNativeAppConfig sharedAppConfig];
        
        // user script for customCSS
        if (appConfig.hasCustomCSS) {
            [LEANUtilities injectCss:@"customCSS" toWebview:webview];
        }
        
        // user script for ios specific customCSS
        if (appConfig.hasIosCustomCSS) {
            [LEANUtilities injectCss:@"iosCustomCSS" toWebview:webview];
        }
        
        // Disabling native bridge for unlicensed apps is taken care by the webview controller
        if (appConfig.injectMedianJS) {
            [LEANUtilities injectJs:@"GoNativeJSBridgeLibrary" ToWebview:webview];
        }
        
        if (appConfig.hasCustomJS) {
            [LEANUtilities injectJs:@"customJS" ToWebview:webview];
        }
        
        if (appConfig.hasIosCustomJS) {
            [LEANUtilities injectJs:@"iosCustomJS" ToWebview:webview];
        }
        
        // user script for viewport
        {
            NSString *stringViewport = [GoNativeAppConfig sharedAppConfig].stringViewport;
            NSNumber *viewportWidth = [GoNativeAppConfig sharedAppConfig].forceViewportWidth;
            NSString *pinchToZoom = [GoNativeAppConfig sharedAppConfig].pinchToZoom ? @"yes" : @"no";
            
            if (viewportWidth) {
                stringViewport = [NSString stringWithFormat:@"width=%@,user-scalable=%@", viewportWidth, pinchToZoom];
            }
            
            if (!stringViewport) {
                stringViewport = @"";
            }
            
            NSString *scriptSource = [NSString stringWithFormat:@"var gonative_setViewport = %@; var gonative_viewportElement = document.querySelector('meta[name=viewport]'); if (gonative_viewportElement) {   if (gonative_setViewport) {         gonative_viewportElement.content = gonative_setViewport;     } else {         gonative_viewportElement.content = gonative_viewportElement.content + ',user-scalable=%@';     } } else if (gonative_setViewport) {     gonative_viewportElement = document.createElement('meta');     gonative_viewportElement.name = 'viewport';     gonative_viewportElement.content = gonative_setViewport; document.head.appendChild(gonative_viewportElement);}", [LEANUtilities jsWrapString:stringViewport], pinchToZoom];
            
            WKUserScript *userScript = [[NSClassFromString(@"WKUserScript") alloc] initWithSource:scriptSource injectionTime:WKUserScriptInjectionTimeAtDocumentEnd forMainFrameOnly:YES];
            [webview.configuration.userContentController addUserScript:userScript];
        }
        
        [((LEANAppDelegate *)[UIApplication sharedApplication].delegate).bridge loadUserScriptsForContentController:webview.configuration.userContentController];
        
        // for our faux content-inset
        webview.scrollView.layer.masksToBounds = NO;
        
        // disable hard press to preview
        webview.allowsLinkPreview = NO;
        
        // set user agent
        webview.customUserAgent = [GoNativeAppConfig sharedAppConfig].userAgent;
    }
}

+(void)removeDoubleTapFromView:(UIView *)view {
    for (UIView *v in view.subviews) {
        if (v != view) [self removeDoubleTapFromView:v];
    }
    
    for (UIGestureRecognizer *gestureRecognizer in view.gestureRecognizers) {
        if ([gestureRecognizer isKindOfClass:[UITapGestureRecognizer class]]) {
            UITapGestureRecognizer *tapRecognizer = (UITapGestureRecognizer*)gestureRecognizer;
            if (tapRecognizer.numberOfTouchesRequired == 1 && tapRecognizer.numberOfTapsRequired == 2)
            {
                [view removeGestureRecognizer:gestureRecognizer];
            }
        }
    }
}

+ (WKProcessPool *)wkProcessPool
{
    static WKProcessPool *processPool;
    
    @synchronized(self)
    {
        if (!processPool){
            processPool = [[NSClassFromString(@"WKProcessPool") alloc] init];
        }
        
        return processPool;
    }
}

// input can be string or array of strings. Returns an array of NSPredicates.
+(NSArray<NSPredicate*>*)createRegexArrayFromStrings:(id)input
{
    if ([input isKindOfClass:[NSArray class]]) {
        NSMutableArray<NSPredicate*> *array = [NSMutableArray arrayWithCapacity:[input count]];
        for (NSString *entry in input) {
            if (![entry isKindOfClass:[NSString class]]) continue;
            NSPredicate *predicate = [NSPredicate predicateWithFormat:@"SELF MATCHES %@", entry];
            if (predicate) {
                [array addObject:predicate];
            } else {
                NSLog(@"Invalid regex: %@", entry);
            }
        }
        return array;
    } else if ([input isKindOfClass:[NSString class]]) {
        return [LEANUtilities createRegexArrayFromStrings:@[input]];
    } else {
        return [NSArray array];
    }
}

+(BOOL)string:(NSString*)string matchesAnyRegex:(NSArray<NSPredicate*>*)regexes
{
    if (!regexes) return NO;
    
    for (NSPredicate *regex in regexes) {
        if ([regex evaluateWithObject:string]) return YES;
    }
    
    return NO;
}

+(NSString*)createJsForPostTo:(NSString*)url data:(NSDictionary*)data
{
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:nil];
    if (!jsonData) {
        return nil;
    }
    
    NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];

    
    NSString *template = @"function gonative_post(url, jsonString) { "
    "    try { "
    "        var params = JSON.parse(jsonString); "
    " "
    "        var form = document.createElement('form'); "
    "        form.setAttribute('method', 'post'); "
    "        form.setAttribute('action', url); "
    " "
    "        for (var key in params) { "
    "            if (params.hasOwnProperty(key)) { "
    "                var hiddenField = document.createElement('input'); "
    "                hiddenField.setAttribute('type', 'hidden'); "
    "                hiddenField.setAttribute('name', key); "
    "                hiddenField.setAttribute('value', params[key]); "
    " "
    "                form.appendChild(hiddenField); "
    "            } "
    "        } "
    " "
    "        form.submit(); "
    "    } catch (ignored) { "
    " "
    "    } "
    "} "
    "gonative_post(%@, %@)";
    
    return [NSString stringWithFormat:template, [self jsWrapString:url], [self jsWrapString:jsonString]];

    return @"";
}


+(NSString*)createJsForCallback:(NSString*)functionName data:(NSDictionary*)data
{
    NSString *parameters;
    NSString *callingParameters;
    NSString *parseJSONStatement;
    NSString *callbackParamater;
    NSData *jsonData;
    NSString *jsonString;
    if (data == nil) {
        parameters = @"functionName";
        callingParameters = @"(%@);";
        parseJSONStatement = @"";
        callbackParamater = @"return callbackFunction();";
    } else {
        jsonData = [NSJSONSerialization dataWithJSONObject:data options:0 error:nil];
        if (!jsonData) {
            return nil;
        }
        jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
        parameters = @"functionName, jsonString";
        callingParameters = @"(%@, %@);";
        parseJSONStatement = @"var data = JSON.parse(jsonString);";
        callbackParamater = @"callbackFunction(data);";
    }
    
    NSString *template = [[NSArray arrayWithObjects:@"function gonative_do_callback(",
                        parameters, @") { ", @"if (typeof window[functionName] !== 'function') return; ",
                           @"try { ", parseJSONStatement, @"var callbackFunction = window[functionName]; ", callbackParamater,
                           @"} catch (ignored) { ", @"} ",
                        @"} ",
                        @"gonative_do_callback", callingParameters, nil] componentsJoinedByString:@""];


    if(jsonString == nil){
        return [NSString stringWithFormat:template, [self jsWrapString:functionName]];
    } else return [NSString stringWithFormat:template, [self jsWrapString:functionName], [self jsWrapString:jsonString]];
    
    return @"";
}

+(BOOL)checkNativeBridgeUrl:(NSString*)url
{
    GoNativeAppConfig *appConfig = [GoNativeAppConfig sharedAppConfig];
    if (!appConfig.nativeBridgeUrls || appConfig.nativeBridgeUrls.count == 0) {
        return YES;
    }
    
    BOOL matched = NO;
    for (NSPredicate *predicate in appConfig.nativeBridgeUrls) {
        BOOL matches = NO;
        @try {
            matches = [predicate evaluateWithObject:url];
        }
        @catch (NSException* exception) {
            NSLog(@"Regex error in nativeBridgeUrls: %@", exception);
        }

        if (matches) {
            matched = YES;
            break;
        }
    }
    return matched;
}

+(BOOL)cookie:(NSHTTPCookie*)cookie matchesUrl:(NSURL*)url
{
    if (!url.host) return NO;
    // check host. Ignore leading "." in cookie and match on subdomain
    NSString *urlHost = [@"." stringByAppendingString:url.host];
    NSString *cookieDomain = cookie.domain;
    if (![cookieDomain hasPrefix:@"."]) {
        cookieDomain = [@"." stringByAppendingString:cookieDomain];
    }
    if (![urlHost hasSuffix:cookieDomain]) {
        return NO;
    }
    
    // check ports if exist
    if (cookie.portList && cookie.portList.count > 0) {
        BOOL matches = NO;
        for (NSNumber *port in cookie.portList) {
            if ([port isEqual:url.port]) {
                matches = YES;
                break;
            }
        }
        if (!matches) {
            return NO;
        }
    }
    
    // check path
    NSString *urlPath = url.path;
    if (!urlPath || urlPath.length == 0) {
        urlPath = @"/";
    }
    if (![urlPath hasPrefix:cookie.path]) {
        return NO;
    }
    // path has prefix, but check for trailing /
    if (![urlPath hasSuffix:@"/"]) {
        urlPath = [urlPath stringByAppendingString:@"/"];
    }
    NSString *cookiePath = cookie.path;
    if (![cookiePath hasSuffix:@"/"]) {
        cookiePath = [cookiePath stringByAppendingString:@"/"];
    }
    
    return [urlPath hasPrefix:cookiePath];
}

@end
