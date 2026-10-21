/** @type {import('next').NextConfig} */
const nextConfig = {
  // L'appli manipule le DOM elle-même : on évite le double montage du mode strict en dev.
  reactStrictMode: false,
};
export default nextConfig;
