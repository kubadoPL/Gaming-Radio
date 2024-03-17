//
//  LEANWebViewController.h
//  LeanIOS
//
//  Created by Weiyin He on 2/10/14.
// Copyright (c) 2014 GoNative.io LLC. All rights reserved.
//

#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import "REFrostedViewController.h"
#import "LEANProfilePicker.h"
@class LEANTabManager;

static NSString *kLEANWebViewControllerUserStartedLoading = @"co.median.ios.WebViewController.started";
static NSString *kLEANWebViewControllerUserFinishedLoading = @"co.median.ios.WebViewController.finished";
static NSString *kLEANWebViewControllerClearPools = @"co.median.ios.WebViewController.clearPools";

@interface LEANWebViewController : UIViewController
@property BOOL checkLoginSignup;
@property LEANTabManager *tabManager;
@property NSURL *initialUrl;
@property UIView *initialWebview;
@property (class, nonatomic, readonly) NSInteger currentWindows;

- (IBAction) showMenu;
- (void) loadUrlString:(NSString*)url;
- (void) loadUrlAfterFilter:(NSURL*) url;
- (void) loadUrl:(NSURL*) url;
- (void) loadRequest:(NSURLRequest*) request;
- (void) loadUrl:(NSURL *)url andJavascript:(NSString*)js;
- (void) runJavascript:(NSString *) script;
- (void) logout;
- (void) showTabBarAnimated:(BOOL)animated;
- (void) hideTabBarAnimated:(BOOL)animated;
- (void) showToolbarAnimated:(BOOL)animated;
- (void) hideToolbarAnimated:(BOOL)animated;
- (void) sharePage: (id)sender;
- (void) sharePageWithUrl:(NSString*)url text:(NSString*)text sender:(id)sender;
- (BOOL) canGoBack;
- (void) goBack;
- (BOOL) canGoForward;
- (void) goForward;
- (void) refreshPressed:(id)sender;
- (void) refreshPage;
- (void) searchPressed:(id)sender;
- (void) setSharePopOverRect:(CGRect)rect;
- (void) handleJSBridgeFunctions:(id)data;
- (void) runJavascriptWithCallback:(id)callback data:(NSDictionary*)data;
@end
