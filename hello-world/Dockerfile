FROM public.ecr.aws/lambda/nodejs:22

# 複製所有 Lambda function 檔案和 package.json
COPY *.mjs package*.json ./

RUN npm install
# If you are building your code for production, instead include a package-lock.json file on this directory and use:
# RUN npm ci --production

# Command can be overwritten by providing a different command in the template directly.
CMD ["app.lambdaHandler"]
