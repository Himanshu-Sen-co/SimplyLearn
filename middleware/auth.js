import { auth } from "../lib/auth.js"
import {fromNodeHeaders} from "better-auth/node"



const Authenticate = async (req, res, next) => {
    try {
        const {session} = await auth.api.getSession({
            headers: fromNodeHeaders(req.headers)
        })
        // console.log("Session found:", session);

        if (!session || !session?.userId)  {
            return res.status(401).json({message:"Unautherize User "})
        }

        req.userId = session.userId;
        next()
    } catch (error) {
        return res.status(401).json({message:"Authentication error : " + error})
    }
}

export default Authenticate;