import { Context } from "elysia";
import { auth } from "./auth";

const betterAuthView = async (context: Context) => {
  const BETTER_AUTH_ACCEPT_METHODS = ["POST", "GET"]
  if (BETTER_AUTH_ACCEPT_METHODS.includes(context.request.method)) {
    console.log(context.request)
    const res = await auth.handler(context.request);
    console.log(res)
    return res;
  }
  else {
    console.log('returning 405')
    context.error(405)
  }
}

export default betterAuthView;
