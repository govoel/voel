import PostHog from 'posthog-react-native';

export const posthog = new PostHog('phc_fobxKG4KqDtmyY1zlp4I3JvSW7A0eQP6mLKDf2nuXep', {
  host: 'https://us.i.posthog.com',
  disableGeoip: true,
  disabled: process.env.NODE_ENV !== 'production',
});
