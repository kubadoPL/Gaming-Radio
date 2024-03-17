//
//  LEANRegexRulesManager.m
//  GonativeIO
//
//  Created by bld ai on 6/14/22.
//  Copyright © 2022 GoNative.io LLC. All rights reserved.
//

#import "LEANRegexRulesManager.h"
#import "LEANWindowsManager.h"
#import "GonativeIO-Swift.h"

@interface LEANRegexRulesManager()
@property LEANWindowsManager *windowsManager;
@property NSArray<NSDictionary *> *regexRules;
@end

@implementation LEANRegexRulesManager

- (instancetype)initWithWvc:(LEANWebViewController *)wvc
{
    self = [super init];
    if (self) {
        self.windowsManager = [[LEANWindowsManager alloc] initWithWvc:wvc];
        [self initializeValues];
    }
    return self;
}

- (void)initializeValues {
    NSArray<NSDictionary *> *regexRules;
    [[GoNativeAppConfig sharedAppConfig] initializeRegexRules:&regexRules];
    self.regexRules = regexRules;
}

- (void)handleUrl:(NSURL *)url query:(NSDictionary*)query {
    if ([@"/set" isEqualToString:url.path]) {
        [self setRules:query[@"rules"]];
    }
}

- (void)setRules:(NSArray *)rules {
    NSArray *regexRules;
    [[GoNativeAppConfig sharedAppConfig] setNewRegexRules:rules regexRulesArray:&regexRules];
    self.regexRules = regexRules;
}

- (NSDictionary *)matchesWithUrlString:(NSString *)urlString {
    for (NSUInteger i = 0; i < self.regexRules.count; i++) {
        NSPredicate *predicate = self.regexRules[i][@"predicate"];
        NSString *mode = self.regexRules[i][@"mode"];
        
        if (![predicate isKindOfClass:[NSPredicate class]] || ![mode isKindOfClass:[NSString class]]) {
            continue;
        }
        
        @try {
            if ([predicate evaluateWithObject:urlString]) {
                return @{ @"matches": @YES, @"mode": mode };
            }
        }
        @catch (NSException* exception) {
            NSLog(@"Error in regex internal external: %@", exception);
        }
    }
    return @{ @"matches": @NO };
}

- (BOOL)shouldHandleRequest:(NSURLRequest *)request {
    NSURL *url = [request URL];
    NSString *urlString = [url absoluteString];
    NSString* hostname = [url host];
    
    NSDictionary *matchResult = [self matchesWithUrlString:urlString];
    
    BOOL matchedRegex = [matchResult[@"matches"] boolValue];
    if (matchedRegex) {
        NSString *mode = matchResult[@"mode"];
        
        if ([mode isKindOfClass:[NSString class]] && ![mode isEqualToString:@"internal"]) {
            [self.windowsManager openUrl:request.URL mode:mode];
            return NO;
        }
    } else  {
        NSString *initialHost = [GoNativeAppConfig sharedAppConfig].initialHost;
        
        if (![hostname isEqualToString:initialHost] && ![hostname hasSuffix:[@"." stringByAppendingString:initialHost]]) {
            [self.windowsManager openUrl:request.URL mode:@"external"];
            return NO;
        }
    }
    
    return YES;
}

@end
